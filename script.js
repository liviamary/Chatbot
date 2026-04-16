// Smart i-Shield Assistant - RAG Enabled
(function() {
'use strict';

const API_BASE_URL = window.location.origin;

let conversationId = sessionStorage.getItem("conversationId");
if(!conversationId){
conversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
sessionStorage.setItem("conversationId",conversationId);
}

let isResponding = false;

const FOLLOW_UP_SUGGESTIONS = [
"Can you explain the architecture?",
"What are the key business benefits?",
"How does the SAP integration work?",
"What are the safety features?"
];

// ============================================
// RAG API CALL
// ============================================

async function streamRagResponse(userInput,onUpdate){

try{

const res = await fetch(`${API_BASE_URL}/chat`,{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
message:userInput,
conversation_id:conversationId
})
});

if(!res.ok){
throw new Error("Backend error");
}

const data = await res.json();

const answer = data.response || data.answer || "No response";

onUpdate(answer);
return answer;

}catch(e){

const fallback = "The chatbot service is waking up or facing an issue. Please wait a few seconds and try again.";
onUpdate(fallback);
return fallback;

}

}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getCurrentTime() {
const now = new Date();
return `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
}

function showToast(message, duration = 2000) {

const existingToast = document.querySelector('.toast');
if(existingToast) existingToast.remove();

const toast = document.createElement('div');
toast.className = 'toast';
toast.textContent = message;

document.body.appendChild(toast);

setTimeout(()=>{
toast.style.opacity='0';
setTimeout(()=>toast.remove(),300);
},duration)

}

function scrollToBottom(element){
if(element){
element.scrollTop = element.scrollHeight;
}
}

function escapeHtml(text){
const div = document.createElement("div");
div.textContent = text;
return div.innerHTML;
}

function formatMessage(text){
return escapeHtml(text)
.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
.replace(/\n/g,'<br>');
}

function setRespondingState(isActive){
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

isResponding = isActive;
if(sendBtn) sendBtn.disabled = isActive;
if(input) input.disabled = isActive;
}

function hideFollowUps(){
const suggestions = document.getElementById("chatSuggestions");
const chips = document.getElementById("suggestionChips");

if(suggestions) suggestions.style.display = "none";
if(chips) chips.innerHTML = "";
}

function showFollowUps(){
const suggestions = document.getElementById("chatSuggestions");
const chips = document.getElementById("suggestionChips");

if(!suggestions || !chips) return;

chips.innerHTML = "";

FOLLOW_UP_SUGGESTIONS.forEach(question=>{
const chip = document.createElement("button");
chip.className = "suggestion-chip";
chip.type = "button";
chip.textContent = question;
chip.addEventListener("click",()=>{
const input = document.getElementById("messageInput");
if(input){
input.value = question;
}
hideFollowUps();
handleSendMessage();
});
chips.appendChild(chip);
});

suggestions.style.display = "block";
}

// ============================================
// CHAT MESSAGE UI
// ============================================

function addMessageToChat(container,text,type){

if(!container) return null;

const messageDiv = document.createElement('div');
messageDiv.className = `message ${type}`;

const bubble = document.createElement('div');
bubble.className = 'message-bubble';

bubble.innerHTML = formatMessage(text);

messageDiv.appendChild(bubble);

if(type==="user"){
const time = document.createElement("div");
time.className="message-time";
time.textContent=getCurrentTime();
messageDiv.appendChild(time);
}

container.appendChild(messageDiv);

scrollToBottom(container);

return bubble;

}

// ============================================
// TYPING
// ============================================

function showTyping(container){

const typing = document.createElement("div");
typing.className="message bot";
typing.id="typingIndicator";

typing.innerHTML = `
<div class="typing-indicator">
<div class="typing-dot"></div>
<div class="typing-dot"></div>
<div class="typing-dot"></div>
</div>
`;

container.appendChild(typing);
scrollToBottom(container);

}

function removeTyping(){

const t = document.getElementById("typingIndicator");
if(t) t.remove();

}

// ============================================
// SEND MESSAGE
// ============================================

async function handleSendMessage(){

const input = document.getElementById("messageInput");
const chat = document.getElementById("chatMessages");

if(!input || !chat || isResponding) return;

const message = input.value.trim();
if(!message) return;

hideFollowUps();
addMessageToChat(chat,message,"user");

input.value="";

setRespondingState(true);
showTyping(chat);

const botBubble = addMessageToChat(chat,"","bot");

await streamRagResponse(message,(partialAnswer)=>{
removeTyping();

if(botBubble){
botBubble.innerHTML = formatMessage(partialAnswer);
scrollToBottom(chat);
}

});

removeTyping();
setRespondingState(false);
showFollowUps();
input.focus();

}

// ============================================
// INDEX PAGE
// ============================================

function initIndexPage(){

const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

function send(messageOverride){

const msg = (messageOverride || input.value).trim();

if(!msg){
showToast("Type a message");
return;
}

sessionStorage.setItem("initialMessage",msg);

window.location.href="chat.html";

}

if(sendBtn){
sendBtn.addEventListener("click",()=>send());
}

if(input){
input.addEventListener("keydown",(e)=>{
if(e.key==="Enter") send();
});
}

// suggestion cards
document.querySelectorAll(".suggestion-card").forEach(card=>{
card.addEventListener("click",function(){

const topic = this.querySelector(".card-title")?.textContent || this.dataset.topic || this.innerText;

send(topic);

});
});

document.querySelectorAll(".reply-pill").forEach(pill=>{
pill.addEventListener("click",function(){
send(this.dataset.reply || this.innerText);
});
});

}

// ============================================
// CHAT PAGE
// ============================================

function initChatPage(){

const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const chat = document.getElementById("chatMessages");
const backBtn = document.getElementById("backBtn");
const newChatBtn = document.getElementById("newChatBtn");

const initial = sessionStorage.getItem("initialMessage");

if(initial && chat){

chat.innerHTML="";
hideFollowUps();

addMessageToChat(chat,initial,"user");

sessionStorage.removeItem("initialMessage");

setRespondingState(true);
showTyping(chat);

const botBubble = addMessageToChat(chat,"","bot");

streamRagResponse(initial,(partialAnswer)=>{
removeTyping();

if(botBubble){
botBubble.innerHTML = formatMessage(partialAnswer);
scrollToBottom(chat);
}

}).finally(()=>{
removeTyping();
setRespondingState(false);
showFollowUps();
input?.focus();
});

}

if(sendBtn){
sendBtn.addEventListener("click",handleSendMessage);
}

if(input){
input.addEventListener("keydown",(e)=>{
if(e.key==="Enter") handleSendMessage();
});
}

if(backBtn){
backBtn.addEventListener("click",()=>{
window.location.href="index.html";
});
}

if(newChatBtn){
newChatBtn.addEventListener("click",()=>{
conversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
sessionStorage.setItem("conversationId",conversationId);
if(chat) chat.innerHTML="";
hideFollowUps();
input?.focus();
showToast("Started a new chat");
});
}

}

// ============================================
// INIT
// ============================================

function init(){

const isChat = document.querySelector(".chat-page");
const isIndex = document.querySelector(".main-content");

if(isIndex){
initIndexPage();
}

if(isChat){
initChatPage();
}

}

init();

})();
