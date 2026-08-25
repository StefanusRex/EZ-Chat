const state = {
  peer: null,
  channel: null,
  connected: false,
  roomId: getRoomId(),
  signal: null,
  localStream: null,
  remoteStream: null,
  micEnabled: true,
  cameraEnabled: true,
  nickname: localStorage.getItem("relay-nickname") || "You",
  peerNickname: "Peer",
};
const $ = (selector) => document.querySelector(selector);
const dialog = $("#connect-dialog");
const messages = $("#messages");
const emptyState = $("#empty-state");
const input = $("#message-input");
const sendButton = $("#send-button");
const connectionLabel = $("#connection-label");
const stateDot = $("#state-dot");
const roomStatus = $("#room-status");
const roomPreview = $("#room-preview");
const toast = $("#toast");
const nicknameDialog = $("#nickname-dialog");
const callStage = $("#call-stage");
const localVideo = $("#local-video");
const remoteVideo = $("#remote-video");

function getRoomId() {
  const existing = window.location.hash.slice(1);
  if (existing) return existing;
  const roomId = crypto.randomUUID().slice(0, 8);
  window.history.replaceState(null, "", `#${roomId}`);
  return roomId;
}

function postSignal(type, payload = {}) {
  state.signal?.send(JSON.stringify({ type, ...payload }));
}

function plainDescription(description) {
  return { type: description.type, sdp: description.sdp };
}

function setupAutomaticSignaling() {
  // WebSocket signaling exchanges SDP while the actual chat/media use WebRTC.
  state.signal = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`,
  );
  state.signal.onmessage = async ({ data }) => {
    const message = JSON.parse(data);
    try {
      if (message.type === "peer-ready") await createOffer();
      if (message.type === "offer")
        await acceptAutomaticOffer(message.description);
      if (
        message.type === "answer" &&
        state.peer?.signalingState === "have-local-offer"
      )
        await state.peer.setRemoteDescription(message.description);
      if (message.type === "error") showToast(message.message);
    } catch (connectionError) {
      showToast(connectionError.message || "Could not connect");
    }
  };
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(
    () => toast.classList.remove("visible"),
    2200,
  );
}

function setConnection(
  connected,
  label = connected ? "Connected directly" : "Waiting for a peer",
) {
  state.connected = connected;
  connectionLabel.textContent = label;
  stateDot.classList.toggle("connected", connected);
  roomStatus.classList.toggle("connected", connected);
  roomPreview.textContent = connected
    ? "Connected directly"
    : "Ready to invite a peer";
  input.disabled = !connected;
  sendButton.disabled = !connected;
  callStage.classList.toggle("active", connected);
  updateCallButtonState();
  if (connected) input.focus();
}

async function enableMedia(kind) {
  // Media is opt-in: this function runs only after a call-control click.
  if (!navigator.mediaDevices?.getUserMedia || !state.peer) {
    showToast(`${kind === "audio" ? "Microphone" : "Webcam"} is unavailable`);
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === "video",
    });
    state.localStream ||= new MediaStream();
    stream.getTracks().forEach((track) => {
      const alreadyHasTrack =
        track.kind === "audio"
          ? state.localStream.getAudioTracks().length > 0
          : state.localStream.getVideoTracks().length > 0;
      if (alreadyHasTrack) {
        track.stop();
        return;
      }
      state.localStream.addTrack(track);
      state.peer.addTrack(track, state.localStream);
    });
    localVideo.srcObject = state.localStream;
    callStage.classList.add("active");
    if (kind === "audio" || kind === "video") {
      state.micEnabled = true;
      state.localStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
    }
    if (kind === "video") state.cameraEnabled = true;
    updateCallButtonState();
    showToast(
      `${kind === "audio" ? "Microphone" : "Webcam and microphone"} enabled`,
    );
    return true;
  } catch {
    showToast(
      `Could not access ${kind === "audio" ? "microphone" : "webcam and microphone"}`,
    );
    return false;
  }
}

function attachLocalMedia(peer) {
  state.localStream
    ?.getTracks()
    .forEach((track) => peer.addTrack(track, state.localStream));
}

function updateCallButtonState() {
  const mic = $("#toggle-mic");
  const camera = $("#toggle-camera");
  mic.classList.toggle("muted", !state.micEnabled);
  camera.classList.toggle("muted", !state.cameraEnabled);
  const micLabel = state.localStream?.getAudioTracks().length
    ? state.micEnabled
      ? "Mute microphone"
      : "Unmute microphone"
    : "Enable microphone";
  const cameraLabel = state.localStream?.getVideoTracks().length
    ? state.cameraEnabled
      ? "Turn webcam off"
      : "Turn webcam on"
    : "Enable webcam and microphone";
  mic.setAttribute("aria-label", micLabel);
  mic.title = micLabel;
  camera.setAttribute("aria-label", cameraLabel);
  camera.title = cameraLabel;
}

function updateNickname() {
  const nickname = state.nickname.trim() || "You";
  state.nickname = nickname.slice(0, 24);
  localStorage.setItem("relay-nickname", state.nickname);
  $("#my-nickname").textContent = state.nickname;
  $("#my-avatar").textContent = state.nickname[0].toUpperCase();
}

function encode(value) {
  return btoa(JSON.stringify(value));
}
function decode(value) {
  return JSON.parse(atob(value.trim()));
}
function clearError() {
  $("#dialog-error").textContent = "";
}
function error(message) {
  $("#dialog-error").textContent = message;
}

function addMessage(
  text,
  mine = false,
  senderName = mine ? state.nickname : state.peerNickname,
) {
  emptyState?.remove();
  const item = document.createElement("div");
  item.className = `message${mine ? " mine" : ""}`;
  item.innerHTML = `<div class="avatar ${mine ? "avatar-me" : "avatar-coral"}"></div><div class="message-body"><span class="message-meta"></span><div class="bubble"></div></div>`;
  item.querySelector(".avatar").textContent =
    senderName[0]?.toUpperCase() || "?";
  item.querySelector(".message-meta").textContent = `${senderName} · just now`;
  item.querySelector(".bubble").textContent = text;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

function handleData(message) {
  try {
    const payload = JSON.parse(message);
    if (payload.type === "profile") {
      state.peerNickname = payload.nickname || "Peer";
      return;
    }
    if (payload.type === "chat")
      addMessage(payload.text, false, payload.nickname || state.peerNickname);
  } catch {
    addMessage(message);
  }
}

function watchChannel(channel) {
  state.channel = channel;
  channel.onopen = () => {
    setConnection(true);
    channel.send(JSON.stringify({ type: "profile", nickname: state.nickname }));
  };
  channel.onclose = () => setConnection(false, "Peer disconnected");
  channel.onerror = () => setConnection(false, "Connection error");
  channel.onmessage = (event) => handleData(event.data);
}

function makePeer() {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  peer.onnegotiationneeded = async () => {
    // Adding a mic or camera track after connection requires a fresh offer.
    if (peer.skipNegotiation || peer.signalingState !== "stable") return;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIce(peer);
    postSignal("offer", {
      description: plainDescription(peer.localDescription),
    });
  };
  peer.ontrack = (event) => {
    state.remoteStream ||= new MediaStream();
    state.remoteStream.addTrack(event.track);
    remoteVideo.srcObject = state.remoteStream;
    callStage.classList.add("active");
    $(".video-placeholder").classList.add("hidden");
    $("#remote-video-label").textContent = state.peerNickname;
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === "connected") setConnection(true);
    if (["failed", "disconnected", "closed"].includes(peer.connectionState))
      setConnection(false, "Peer disconnected");
  };
  return peer;
}

async function waitForIce(peer) {
  if (peer.iceGatheringState === "complete") return;
  await new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, 5000);
    peer.addEventListener("icegatheringstatechange", () => {
      if (peer.iceGatheringState === "complete") {
        window.clearTimeout(timeout);
        resolve();
      }
    });
  });
}

function openDialog() {
  clearError();
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

async function createOffer() {
  clearError();
  state.peer?.close();
  state.peer = makePeer();
  state.peer.skipNegotiation = true;
  attachLocalMedia(state.peer);
  watchChannel(state.peer.createDataChannel("relay-chat"));
  const offer = await state.peer.createOffer();
  await state.peer.setLocalDescription(offer);
  await waitForIce(state.peer);
  const description = plainDescription(state.peer.localDescription);
  state.peer.skipNegotiation = false;
  postSignal("offer", { description });
  showToast("Connecting peer...");
}

async function acceptAutomaticOffer(description) {
  const isNewPeer = !state.peer;
  state.peer ||= makePeer();
  if (isNewPeer) attachLocalMedia(state.peer);
  if (!state.channel)
    state.peer.ondatachannel = (event) => watchChannel(event.channel);
  await state.peer.setRemoteDescription(description);
  const answer = await state.peer.createAnswer();
  await state.peer.setLocalDescription(answer);
  await waitForIce(state.peer);
  postSignal("answer", {
    description: plainDescription(state.peer.localDescription),
  });
  showToast("Connecting to room...");
}

function switchRole(role) {
  document
    .querySelectorAll(".role-tab")
    .forEach((tab) =>
      tab.classList.toggle("active", tab.dataset.role === role),
    );
  $("#create-room-step").classList.toggle("hidden", role !== "create");
  $("#join-room-step").classList.toggle("hidden", role !== "join");
  $("#share-room-step").classList.add("hidden");
  clearError();
}

$("#setup-button").addEventListener("click", async () => {
  switchRole("create");
  openDialog();
});
$("#edit-nickname").addEventListener("click", () => {
  $("#nickname-input").value = state.nickname;
  if (typeof nicknameDialog.showModal === "function")
    nicknameDialog.showModal();
  else nicknameDialog.setAttribute("open", "");
});
$("#nickname-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.nickname = $("#nickname-input").value;
  updateNickname();
  if (state.channel?.readyState === "open")
    state.channel.send(
      JSON.stringify({ type: "profile", nickname: state.nickname }),
    );
  nicknameDialog.close();
  showToast("Nickname updated");
});
$("#new-room").addEventListener("click", async () => {
  state.roomId = crypto.randomUUID().slice(0, 8);
  window.history.replaceState(null, "", `#${state.roomId}`);
  switchRole("create");
  openDialog();
});
document
  .querySelectorAll(".role-tab")
  .forEach((tab) =>
    tab.addEventListener("click", () => switchRole(tab.dataset.role)),
  );
async function connectRoom(mode) {
  state.signal.onopen = () =>
    state.signal.send(JSON.stringify({ type: mode, roomId: state.roomId }));
  if (state.signal.readyState === WebSocket.OPEN) state.signal.onopen();
  if (mode === "create") {
    $("#room-url-output").value = window.location.href;
    $("#share-room-step").classList.remove("hidden");
    showToast("Room created. Share the URL below.");
  } else {
    dialog.close();
    showToast("Joining room...");
  }
}
$("#create-room").addEventListener("click", () => connectRoom("create"));
$("#join-room").addEventListener("click", () => connectRoom("join"));
$("#copy-room-url").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("#room-url-output").value);
  showToast("Room URL copied");
});
$("#copy-id").addEventListener("click", async () => {
  await navigator.clipboard.writeText("local-relay-peer");
  showToast("Peer ID copied");
});
$("#attach-button").addEventListener("click", () =>
  showToast("File sharing is coming soon"),
);
$("#more-button").addEventListener("click", () =>
  showToast("Room options are coming soon"),
);

$("#toggle-mic").addEventListener("click", () => {
  if (!state.localStream?.getAudioTracks().length) {
    enableMedia("audio");
    return;
  }
  state.micEnabled = !state.micEnabled;
  state.localStream?.getAudioTracks().forEach((track) => {
    track.enabled = state.micEnabled;
  });
  updateCallButtonState();
});
$("#toggle-camera").addEventListener("click", () => {
  if (!state.localStream?.getVideoTracks().length) {
    enableMedia("video");
    return;
  }
  state.cameraEnabled = !state.cameraEnabled;
  state.localStream?.getVideoTracks().forEach((track) => {
    track.enabled = state.cameraEnabled;
  });
  updateCallButtonState();
});
$("#end-call").addEventListener("click", () => {
  state.peer?.close();
  state.channel?.close();
  state.localStream?.getTracks().forEach((track) => track.stop());
  state.localStream = null;
  state.remoteStream = null;
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  callStage.classList.remove("active");
  setConnection(false, "Call ended");
});

$("#composer").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  if (!state.channel || state.channel.readyState !== "open") return;
  state.channel.send(
    JSON.stringify({ type: "chat", nickname: state.nickname, text }),
  );
  addMessage(text, true);
  input.value = "";
});

input.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
    $("#composer").requestSubmit();
});

updateNickname();
setupAutomaticSignaling();
