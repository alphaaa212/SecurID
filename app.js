// DOM要素の取得
const loginScreen = document.getElementById("login-screen");
const mainScreen = document.getElementById("main-screen");
const editScreen = document.getElementById("edit-screen");
const loginForm = document.getElementById("login-form");
const logoutBtn = document.getElementById("logout-btn");
const imageUpload = document.getElementById("image-upload");
const gallery = document.getElementById("gallery");
const canvas = document.getElementById("edit-canvas");
const ctx = canvas.getContext("2d");
const saveEditBtn = document.getElementById("save-edit-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const userInfo = document.getElementById("user-info");
const undoBtn = document.getElementById("undo-btn");
const penSizeInput = document.getElementById("pen-size");
const paintModeBtn = document.getElementById("paint-mode-btn");
const cropModeBtn = document.getElementById("crop-mode-btn");
const applyCropBtn = document.getElementById("apply-crop-btn");
const penControls = document.querySelector(".pen-controls");
const imageTitleInput = document.getElementById("image-title");

// モーダル要素
const imageModal = document.getElementById("image-modal");
const modalImg = document.getElementById("modal-img");
const closeModal = document.querySelector(".close-modal");
const editIconBtn = document.getElementById("edit-icon-btn");
const unmaskBtn = document.getElementById("unmask-btn");
const modalSecretInput = document.getElementById("modal-secret-phrase");
const deleteImgBtn = document.getElementById("delete-img-btn");
const unmaskControls = document.getElementById("unmask-controls");

// 状態管理
let isDrawing = false;
let currentUserEmail = null;
let users = JSON.parse(localStorage.getItem("securid_users")) || {};
let undoStack = [];
let editingImageIndex = -1; 
let currentOriginalSrc = null; 
let editMode = 'paint'; 
let cropStart = null;
let cropEnd = null;
let lastCanvasContent = null; 

// 画面切り替え関数
function showScreen(screenElement) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  screenElement.classList.add("active");

  if (screenElement === loginScreen) {
    userInfo.textContent = "";
  }
}

// --- 認証機能 ---
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const secretPhrase = document.getElementById("secretPhrase").value;

  if (!email || !password || !secretPhrase) {
    alert("すべての項目を入力してください。");
    return;
  }

  if (!users[email]) {
    users[email] = {
      password: password,
      secretPhrase: secretPhrase,
      images: [],
    };
    saveUsers();
    alert("新規登録が完了しました。");
    loginSuccess(email);
  } else {
    const user = users[email];
    if (user.password === password && user.secretPhrase === secretPhrase) {
      loginSuccess(email);
    } else {
      alert("認証情報が一致しません。");
    }
  }
});

function saveUsers() {
  localStorage.setItem("securid_users", JSON.stringify(users));
}

function loginSuccess(email) {
  currentUserEmail = email;
  userInfo.textContent = `ログイン中: ${email}`;
  showScreen(mainScreen);
  renderGallery();
}

logoutBtn.addEventListener("click", () => {
  currentUserEmail = null;
  userInfo.textContent = "";
  showScreen(loginScreen);
  loginForm.reset();
});

// --- キャンバス状態保存 (Undo用) ---
function saveState() {
  undoStack.push({
    imgData: ctx.getImageData(0, 0, canvas.width, canvas.height),
    width: canvas.width,
    height: canvas.height,
    originalSrc: currentOriginalSrc
  });
  if (undoStack.length > 20) undoStack.shift();
}

undoBtn.addEventListener("click", () => {
  if (undoStack.length > 0) {
    const lastState = undoStack.pop();
    canvas.width = lastState.width;
    canvas.height = lastState.height;
    ctx.putImageData(lastState.imgData, 0, 0);
    currentOriginalSrc = lastState.originalSrc;
    applyCropBtn.classList.add("hidden");
  }
});

// --- モード切替 ---
paintModeBtn.addEventListener("click", () => {
  editMode = 'paint';
  paintModeBtn.classList.add("active");
  cropModeBtn.classList.remove("active");
  penControls.classList.remove("hidden");
  applyCropBtn.classList.add("hidden");
  redrawCanvas();
});

cropModeBtn.addEventListener("click", () => {
  editMode = 'crop';
  cropModeBtn.classList.add("active");
  paintModeBtn.classList.remove("active");
  penControls.classList.add("hidden");
  cropStart = null;
  cropEnd = null;
});

// --- 画像アップロードとキャンバス描画 ---
imageUpload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    startEditing(event.target.result, event.target.result, -1);
  };
  reader.readAsDataURL(file);
});

function startEditing(maskedSrc, originalSrc, index = -1) {
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    undoStack = [];
    editingImageIndex = index;
    currentOriginalSrc = originalSrc; 
    editMode = 'paint';
    paintModeBtn.classList.add("active");
    cropModeBtn.classList.remove("active");
    penControls.classList.remove("hidden");
    applyCropBtn.classList.add("hidden");
    
    if (index >= 0) {
      imageTitleInput.value = users[currentUserEmail].images[index].title || "";
    } else {
      imageTitleInput.value = "";
    }

    showScreen(editScreen);
  };
  img.src = maskedSrc;
}

// --- マスキング & トリミング ---
function getMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY,
  };
}

canvas.addEventListener("mousedown", (e) => {
  const pos = getMousePos(e);
  if (editMode === 'paint') {
    saveState();
    isDrawing = true;
    ctx.fillStyle = "#000000";
    const size = parseInt(penSizeInput.value) / 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
    ctx.fill();
  } else if (editMode === 'crop') {
    isDrawing = true;
    cropStart = pos;
    cropEnd = pos;
    lastCanvasContent = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  const pos = getMousePos(e);

  if (editMode === 'paint') {
    const size = parseInt(penSizeInput.value);
    ctx.lineTo(pos.x, pos.y);
    ctx.lineWidth = size;
    ctx.strokeStyle = "#000000";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  } else if (editMode === 'crop') {
    cropEnd = pos;
    redrawCropUI();
  }
});

canvas.addEventListener("mouseup", () => {
  isDrawing = false;
  if (editMode === 'paint') {
    ctx.beginPath();
  } else if (editMode === 'crop') {
    if (cropStart && cropEnd) {
      applyCropBtn.classList.remove("hidden");
    }
  }
});

function redrawCropUI() {
  if (!lastCanvasContent) return;
  ctx.putImageData(lastCanvasContent, 0, 0);
  const x = Math.min(cropStart.x, cropEnd.x);
  const y = Math.min(cropStart.y, cropEnd.y);
  const w = Math.abs(cropStart.x - cropEnd.x);
  const h = Math.abs(cropStart.y - cropEnd.y);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, canvas.width, y); 
  ctx.fillRect(0, y + h, canvas.width, canvas.height - (y + h)); 
  ctx.fillRect(0, y, x, h); 
  ctx.fillRect(x + w, y, canvas.width - (x + w), h); 
  ctx.strokeStyle = "#0056b3";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function redrawCanvas() {
  if (lastCanvasContent) {
    ctx.putImageData(lastCanvasContent, 0, 0);
  }
}

applyCropBtn.addEventListener("click", () => {
  if (!cropStart || !cropEnd) return;
  saveState();
  const x = Math.round(Math.min(cropStart.x, cropEnd.x));
  const y = Math.round(Math.min(cropStart.y, cropEnd.y));
  const w = Math.round(Math.abs(cropStart.x - cropEnd.x));
  const h = Math.round(Math.abs(cropStart.y - cropEnd.y));
  if (w < 5 || h < 5) return;
  const croppedData = ctx.getImageData(x, y, w, h);
  const offCanvas = document.createElement("canvas");
  const offCtx = offCanvas.getContext("2d");
  const originalImg = new Image();
  originalImg.onload = () => {
    offCanvas.width = w;
    offCanvas.height = h;
    offCtx.drawImage(originalImg, x, y, w, h, 0, 0, w, h);
    currentOriginalSrc = offCanvas.toDataURL("image/jpeg");
    canvas.width = w;
    canvas.height = h;
    ctx.putImageData(croppedData, 0, 0);
    applyCropBtn.classList.add("hidden");
    cropStart = null;
    cropEnd = null;
    lastCanvasContent = null;
    paintModeBtn.click();
  };
  originalImg.src = currentOriginalSrc;
});

// --- 画像の保存 ---
saveEditBtn.addEventListener("click", () => {
  const title = imageTitleInput.value.trim();
  if (!title) {
    alert("画像の名前を入力してください。");
    return;
  }

  const maskedDataURL = canvas.toDataURL("image/jpeg");

  if (currentUserEmail && users[currentUserEmail]) {
    const imageData = {
      title: title,
      masked: maskedDataURL,
      original: currentOriginalSrc
    };

    if (editingImageIndex >= 0) {
      users[currentUserEmail].images[editingImageIndex] = imageData;
    } else {
      users[currentUserEmail].images.push(imageData);
    }
    saveUsers();
  }

  imageUpload.value = "";
  showScreen(mainScreen);
  renderGallery();
});

cancelEditBtn.addEventListener("click", () => {
  imageUpload.value = "";
  showScreen(mainScreen);
});

function renderGallery() {
  gallery.textContent = "";
  if (!currentUserEmail || !users[currentUserEmail]) return;
  
  const savedImages = users[currentUserEmail].images;
  savedImages.forEach((imgObj, index) => {
    const card = document.createElement("div");
    card.className = "gallery-item";
    
    const title = (typeof imgObj === 'string') ? "未命名" : imgObj.title;
    const span = document.createElement("span");
    span.textContent = title;
    
    card.appendChild(span);
    card.addEventListener("click", () => openModal(index));
    gallery.appendChild(card);
  });
}

// --- モーダル表示 ---
let currentModalImageIndex = -1;

function openModal(index) {
  const imgObj = users[currentUserEmail].images[index];
  const src = (typeof imgObj === 'string') ? imgObj : imgObj.masked;
  
  modalImg.src = src; // 常にマスク済みの画像を表示
  currentModalImageIndex = index;
  modalSecretInput.value = ""; 
  imageModal.style.display = "block";
  
  // 未解除の状態にするため、アンマスク用のコントロールは常に表示（古いデータ除く）
  unmaskControls.classList.remove("hidden");
  if (typeof imgObj === 'string') unmaskControls.classList.add("hidden");
}

function closeImageModal() {
  imageModal.style.display = "none";
}

closeModal.onclick = closeImageModal;
window.onclick = (event) => {
  if (event.target === imageModal) {
    closeImageModal();
  }
};

unmaskBtn.addEventListener("click", () => {
  if (currentModalImageIndex < 0) return;
  const enteredPhrase = modalSecretInput.value;
  const user = users[currentUserEmail];

  if (enteredPhrase === user.secretPhrase) {
    const imgObj = user.images[currentModalImageIndex];
    const originalSrc = (typeof imgObj === 'string') ? imgObj : imgObj.original;
    modalImg.src = originalSrc; 
    alert("閲覧制限を解除しました。");
  } else {
    alert("合言葉が正しくありません。");
  }
});

editIconBtn.addEventListener("click", () => {
  if (currentModalImageIndex >= 0) {
    const imgObj = users[currentUserEmail].images[currentModalImageIndex];
    const maskedSrc = (typeof imgObj === 'string') ? imgObj : imgObj.masked;
    const originalSrc = (typeof imgObj === 'string') ? imgObj : imgObj.original;
    startEditing(maskedSrc, originalSrc, currentModalImageIndex);
    imageModal.style.display = "none";
  }
});

deleteImgBtn.addEventListener("click", () => {
  if (currentModalImageIndex < 0) return;
  if (confirm("この画像を削除してもよろしいですか？")) {
    users[currentUserEmail].images.splice(currentModalImageIndex, 1);
    saveUsers();
    closeImageModal();
    renderGallery();
  }
});
