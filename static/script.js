let historyBox = document.getElementById("history");
let chatBox = document.getElementById("chatBox");

function addMessage(type, text) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${type}`;
    messageDiv.innerHTML = text;
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function addHistory(question) {
    const historyItem = document.createElement("div");
    historyItem.className = "history-item";
    historyItem.innerText = question;
    historyItem.onclick = function () {
        document.getElementById("question").value = question;
    };
    historyBox.appendChild(historyItem);
}

async function askQuestion() {
    let questionInput = document.getElementById("question");
    let question = questionInput.value;

    if (question.trim() === "") {
        alert("Please enter a question");
        return;
    }

    addMessage("user", `<b>You:</b><br>${question}`);
    addHistory(question);

    questionInput.value = "";

    const loadingDiv = document.createElement("div");
    loadingDiv.className = "message bot";
    loadingDiv.id = "loading";
    loadingDiv.innerText = "Thinking...";
    chatBox.appendChild(loadingDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        let response = await fetch(`/ask?prompt=${encodeURIComponent(question)}&max_tokens=100`);
        let data = await response.json();

        document.getElementById("loading").remove();
        addMessage("bot", `<b>AI:</b><br>${data.answer}`);
    } catch (error) {
        document.getElementById("loading").remove();
        addMessage("bot", "Error: Unable to get response from model.");
    }
}

function handleEnter(event) {
    if (event.key === "Enter") {
        askQuestion();
    }
}
