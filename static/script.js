// --- State Management ---
// Object storing active sessions: { sessionId: { id, title, messages: [] } }
let sessions = {};
// Keeps track of which session is currently open in the viewport
let currentSessionId = null;
// Stores the Base64 representation of the attached image (without MIME type header)
let selectedImageBase64 = null;

// DOM Element Selections
const sessionsList = document.getElementById("sessionsList");
const chatBox = document.getElementById("chatBox");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreview = document.getElementById("imagePreview");
const questionInput = document.getElementById("question");

/**
 * Helper: Converts plain text into safe HTML, supporting basic Markdown tags
 * like **bold**, *italic*, and newlines.
 */
function formatText(text) {
    let escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Convert &lt;think&gt;...&lt;/think&gt; to a styled reasoning block
    escaped = escaped.replace(/&lt;think&gt;([\s\S]*?)&lt;\/think&gt;/g, "<div class='thinking-block'>💡 <b>Reasoning Process:</b><br>$1</div>");

    // Convert **text** to <strong>text</strong>
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Convert *text* to <em>text</em>
    escaped = escaped.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // Convert newlines to HTML break tags
    escaped = escaped.replace(/\n/g, "<br>");

    return escaped;
}

/**
 * Initializes a new chat session.
 * Triggered on startup or by clicking "+ New Chat".
 */
function createNewSession() {
    // Generate a simple unique ID using timestamp and random number
    const sessionId = "session_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

    // Register session in state
    sessions[sessionId] = {
        id: sessionId,
        title: "New Chat",
        messages: [] // Starts empty
    };

    // Open the new session immediately
    selectSession(sessionId);
}

/**
 * Switches the active viewport to the selected session.
 */
function selectSession(sessionId) {
    currentSessionId = sessionId;
    renderSessionsList();
    renderChatArea();
}

/**
 * Deletes a session locally and notifies the backend to clear its memory history.
 */
async function deleteSession(sessionId, event) {
    // Prevent the click event from bubbling up and selecting the deleted session
    event.stopPropagation();

    // Remove from local memory state
    delete sessions[sessionId];

    // Notify backend to clear conversation history from server RAM
    try {
        await fetch("/clear", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId })
        });
    } catch (e) {
        console.error("Failed to clear backend session memory:", e);
    }

    // Adjust selected session if we deleted the current active one
    const remainingIds = Object.keys(sessions);
    if (currentSessionId === sessionId) {
        if (remainingIds.length > 0) {
            selectSession(remainingIds[0]);
        } else {
            createNewSession();
        }
    } else {
        renderSessionsList();
    }
}

/**
 * Redraws the sidebar session list.
 */
function renderSessionsList() {
    sessionsList.innerHTML = "";

    Object.values(sessions).forEach(session => {
        const item = document.createElement("div");
        item.className = `session-item ${session.id === currentSessionId ? "active" : ""}`;
        item.onclick = () => selectSession(session.id);

        // Title label text
        const titleSpan = document.createElement("span");
        titleSpan.innerText = session.title;
        item.appendChild(titleSpan);

        // Delete button (represented by an '×' character)
        const delBtn = document.createElement("button");
        delBtn.className = "delete-session-btn";
        delBtn.innerHTML = "&times;";
        delBtn.onclick = (e) => deleteSession(session.id, e);
        item.appendChild(delBtn);

        sessionsList.appendChild(item);
    });
}

/**
 * Clears the chatbox viewport and draws the message history of the current session.
 */
function renderChatArea() {
    chatBox.innerHTML = "";

    const activeSession = sessions[currentSessionId];
    if (!activeSession || activeSession.messages.length === 0) {
        // If history is empty, show default welcome template
        const welcomeDiv = document.createElement("div");
        welcomeDiv.className = "message bot";
        welcomeDiv.innerText = "Hello! I am your AI assistant. Ask me anything, or attach an image to get started.";
        chatBox.appendChild(welcomeDiv);
        return;
    }

    // Loop through session messages and render bubbles
    activeSession.messages.forEach(msg => {
        const messageDiv = document.createElement("div");
        messageDiv.className = `message ${msg.role}`;

        let contentHtml = `<b>${msg.role === 'user' ? 'You' : 'AI'}:</b><br>`;
        
        // If the user message had an image, render it inside the bubble
        if (msg.image) {
            contentHtml += `<img src="data:image/jpeg;base64,${msg.image}" alt="Uploaded attachment" />`;
        }

        contentHtml += formatText(msg.text);

        // If the response came from a model, display the model badge credit with a read-aloud button
        if (msg.role === 'bot' && msg.model) {
            const escapedText = msg.text.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
            contentHtml += `
                <div class="model-badge">
                    <span>AI Response generated by ${msg.model}</span>
                    <button class="speak-btn" onclick="speakMessage(this, '${escapedText}')" title="Read aloud">🔊</button>
                </div>
            `;
        }

        messageDiv.innerHTML = contentHtml;
        chatBox.appendChild(messageDiv);
    });

    // Auto-scroll viewport to latest bubble
    chatBox.scrollTop = chatBox.scrollHeight;
}

/**
 * Handles image selection: converts image file into Base64 format for API transmission.
 */
function handleImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function () {
        // reader.result contains the data URL: "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
        // We split on the comma to extract only the raw Base64 data block
        selectedImageBase64 = reader.result.split(",")[1];
        
        // Display preview thumbnail in UI
        imagePreview.src = reader.result;
        imagePreviewContainer.style.display = "block";
    };
    reader.readAsDataURL(file);
}

/**
 * Clears selected image preview.
 */
function removeSelectedImage() {
    document.getElementById("imageInput").value = "";
    selectedImageBase64 = null;
    imagePreviewContainer.style.display = "none";
    imagePreview.src = "";
}

/**
 * Primary submission flow. Transmits query, reads SSE streaming blocks,
 * and updates local and backend state.
 */
async function askQuestion() {
    const prompt = questionInput.value.trim();
    
    // Validate if there is a prompt or an attached image
    if (prompt === "" && !selectedImageBase64) {
        alert("Please enter a question or upload an image.");
        return;
    }

    // Save values locally to submit
    const currentPrompt = prompt;
    const currentImg = selectedImageBase64;

    // Reset input fields
    questionInput.value = "";
    removeSelectedImage();

    // 1. Update Client Session state with User message
    const activeSession = sessions[currentSessionId];
    activeSession.messages.push({
        role: "user",
        text: currentPrompt,
        image: currentImg
    });

    // Update title of session to the first user question if it was named "New Chat"
    if (activeSession.title === "New Chat" && currentPrompt) {
        activeSession.title = currentPrompt.length > 25 ? currentPrompt.substring(0, 22) + "..." : currentPrompt;
        renderSessionsList();
    }

    // Redraw chat log to show the user's message immediately
    renderChatArea();

    // 2. Create the Bot response placeholder bubble with a Loading indicator
    const botMessageDiv = document.createElement("div");
    botMessageDiv.className = "message bot";
    botMessageDiv.innerHTML = "<b>AI:</b><br><span id='loadingText'>Thinking...</span>";
    chatBox.appendChild(botMessageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    let botMessageText = "";
    let modelName = "";

    try {
        // 3. Initiate POST request requesting stream output
        const response = await fetch("/ask", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                prompt: currentPrompt,
                image_base64: currentImg,
                max_tokens: 2048
            })
        });

        // Remove the temporary "Thinking..." loading element
        const loadingElement = document.getElementById("loadingText");
        if (loadingElement) loadingElement.remove();

        // 4. Set up Streaming Reader to capture chunks as they stream from FastAPI
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        // Loop until the stream concludes
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // Detect if the chunk starts with our model signature tag: [[MODEL:name]]
            if (chunk.includes("[[MODEL:")) {
                const match = chunk.match(/\[\[MODEL:(.*?)\]\]/);
                if (match) {
                    modelName = match[1];
                    // Remove tag metadata from display content
                    const cleanChunk = chunk.replace(match[0], "");
                    botMessageText += cleanChunk;
                } else {
                    botMessageText += chunk;
                }
            } else {
                botMessageText += chunk;
            }

            // Render accumulated text using safe HTML helper
            botMessageDiv.innerHTML = `<b>AI:</b><br>${formatText(botMessageText)}`;

            // Inject the model indicator badge if present
            if (modelName) {
                let badge = botMessageDiv.querySelector(".model-badge");
                if (!badge) {
                    badge = document.createElement("span");
                    badge.className = "model-badge";
                    botMessageDiv.appendChild(badge);
                }
                badge.innerText = `AI Response generated by ${modelName}`;
            }

            // Keep scrolling during active text production
            chatBox.scrollTop = chatBox.scrollHeight;
        }

        // 5. Success: Save Bot response in session history state
        activeSession.messages.push({
            role: "bot",
            text: botMessageText,
            model: modelName
        });

        // Redraw chat area to replace streaming bubble with final bubble (adds read-aloud button)
        renderChatArea();

    } catch (error) {
        console.error(error);
        const loading = document.getElementById("loadingText");
        if (loading) loading.remove();
        
        const errorText = "Error: Failed to fetch stream from API.";
        botMessageDiv.innerHTML = `<b>AI:</b><br><span style="color: #ef4444;">${errorText}</span>`;
        
        activeSession.messages.push({
            role: "bot",
            text: errorText
        });
    }
}

/**
 * Triggers submission when Enter key is pressed in the input bar.
 */
function handleEnter(event) {
    if (event.key === "Enter") {
        askQuestion();
    }
}

// Initialize voices list for Speech Synthesis
let speechVoices = [];
function loadVoices() {
    if (window.speechSynthesis) {
        speechVoices = window.speechSynthesis.getVoices();
    }
}
if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
}

/**
 * Speech Synthesis (Text-to-Speech) with primary Option A (Web Speech API)
 * and fallback Option B (Groq Orpheus API).
 */
let currentUtterance = null;
let currentAudio = null;
let activeSpeakBtn = null;

function speakMessage(btn, text) {
    // If already playing, stop playback
    if (btn.classList.contains("playing")) {
        stopSpeaking();
        return;
    }
    
    stopSpeaking();
    activeSpeakBtn = btn;
    
    // Strip reasoning thinking tags and HTML tags
    const cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, "")
                          .replace(/&lt;think&gt;[\s\S]*?&lt;\/think&gt;/g, "")
                          .replace(/<[^>]*>/g, "")
                          .trim();

    // Option A: Primary Web Speech API
    if (window.speechSynthesis) {
        try {
            window.speechSynthesis.cancel();
            
            currentUtterance = new SpeechSynthesisUtterance(cleanText);
            
            if (speechVoices.length > 0) {
                // Find first available English voice
                const englishVoice = speechVoices.find(v => v.lang.startsWith("en-") || v.lang === "en");
                if (englishVoice) {
                    currentUtterance.voice = englishVoice;
                }
            }
            
            currentUtterance.onstart = () => {
                btn.classList.add("playing");
            };
            
            currentUtterance.onend = () => {
                btn.classList.remove("playing");
                activeSpeakBtn = null;
            };
            
            currentUtterance.onerror = (e) => {
                console.warn("Web Speech API error. Falling back to Groq Orpheus API...", e);
                playOrpheusFallback(btn, cleanText);
            };
            
            window.speechSynthesis.speak(currentUtterance);
            return;
        } catch (err) {
            console.warn("Web Speech API initialization failed. Falling back to Orpheus...", err);
        }
    }
    
    // Option B: Fallback Groq Orpheus API
    playOrpheusFallback(btn, cleanText);
}

function playOrpheusFallback(btn, cleanText) {
    try {
        const audioUrl = `/speak?text=${encodeURIComponent(cleanText)}`;
        currentAudio = new Audio(audioUrl);
        
        currentAudio.onplay = () => {
            btn.classList.add("playing");
        };
        
        currentAudio.onended = () => {
            btn.classList.remove("playing");
            activeSpeakBtn = null;
        };
        
        currentAudio.onerror = (e) => {
            btn.classList.remove("playing");
            activeSpeakBtn = null;
            console.error("Orpheus TTS fallback failed:", e);
            alert("Speech synthesis playback failed.");
        };
        
        currentAudio.play();
    } catch (err) {
        btn.classList.remove("playing");
        activeSpeakBtn = null;
        console.error("Failed to execute Orpheus fallback:", err);
    }
}

function stopSpeaking() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    if (activeSpeakBtn) {
        activeSpeakBtn.classList.remove("playing");
        activeSpeakBtn = null;
    }
}

/**
 * Microphone Audio Recording (Speech-to-Text) using MediaRecorder.
 * Transcribes audio chunks to backend /transcribe.
 */
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

async function toggleRecording() {
    const micBtn = document.getElementById("micBtn");
    
    if (isRecording) {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
        }
        micBtn.classList.remove("recording");
        micBtn.title = "Record voice";
        isRecording = false;
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            
            let options = { mimeType: "audio/webm" };
            if (!MediaRecorder.isTypeSupported("audio/webm")) {
                options = { mimeType: "audio/ogg" };
            }
            if (!MediaRecorder.isTypeSupported("audio/ogg")) {
                options = {};
            }

            mediaRecorder = new MediaRecorder(stream, options);
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
                stream.getTracks().forEach(track => track.stop());
                
                micBtn.innerText = "⏳";
                micBtn.title = "Transcribing...";
                
                try {
                    const formData = new FormData();
                    formData.append("file", audioBlob, "recording.webm");
                    
                    const response = await fetch("/transcribe", {
                        method: "POST",
                        body: formData
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.text) {
                            questionInput.value = data.text;
                            questionInput.focus();
                        }
                    } else {
                        console.error("Transcription request failed");
                    }
                } catch (err) {
                    console.error("Error communicating with transcription endpoint:", err);
                } finally {
                    micBtn.innerText = "🎤";
                    micBtn.title = "Record voice";
                }
            };
            
            mediaRecorder.start();
            micBtn.classList.add("recording");
            micBtn.title = "Click to stop recording";
            isRecording = true;
        } catch (err) {
            console.error("Microphone capture failed:", err);
            alert("Could not access microphone. Please check browser permissions.");
        }
    }
}

// Initialize application state on start
createNewSession();
