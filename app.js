const $ = (id) => document.getElementById(id);
const storageKey = "simple_inventory_v2";
let records = JSON.parse(localStorage.getItem(storageKey) || "[]");
let stream = null;
let detector = null;
let scanning = false;
let scanTimer = null;

function saveStorage() {
  localStorage.setItem(storageKey, JSON.stringify(records));
}

function showMessage(text) {
  $("message").textContent = text;
  setTimeout(() => { $("message").textContent = ""; }, 2400);
}

function setHelp(text) {
  $("cameraHelp").textContent = text || "";
}

function render() {
  const list = $("list");
  list.innerHTML = "";
  if (records.length === 0) {
    list.innerHTML = `<tr><td colspan="3">まだ入力がありません</td></tr>`;
    return;
  }
  records.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(item.barcode)}</td><td>${escapeHtml(item.name)}</td><td>${item.qty}</td>`;
    list.appendChild(tr);
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[c]));
}

function clearForm() {
  $("barcode").value = "";
  $("name").value = "";
  $("qty").value = "";
  $("barcode").focus();
}

$("saveBtn").addEventListener("click", () => {
  const barcode = $("barcode").value.trim();
  const name = $("name").value.trim();
  const qty = Number($("qty").value);

  if (!barcode) return showMessage("バーコードを入力してください");
  if (!name) return showMessage("商品名を入力してください");
  if (!Number.isFinite(qty)) return showMessage("在庫数を入力してください");

  const existing = records.find((r) => r.barcode === barcode);
  if (existing) {
    existing.name = name;
    existing.qty = qty;
    existing.updatedAt = new Date().toLocaleString("ja-JP");
  } else {
    records.unshift({ barcode, name, qty, updatedAt: new Date().toLocaleString("ja-JP") });
  }
  saveStorage();
  render();
  clearForm();
  showMessage("保存しました");
});

$("exportBtn").addEventListener("click", () => {
  if (records.length === 0) return showMessage("出力するデータがありません");
  const header = ["バーコード", "商品名", "在庫数", "更新日時"];
  const rows = records.map((r) => [r.barcode, r.name, r.qty, r.updatedAt]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `在庫一覧_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

$("clearBtn").addEventListener("click", () => {
  if (!confirm("入力済みデータを全部削除しますか？")) return;
  records = [];
  saveStorage();
  render();
});

async function startCameraScan() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHelp("この開き方ではカメラが使えません。Chromeで開くか、HTTPS/localhostで表示してください。");
      return;
    }

    if (!("BarcodeDetector" in window)) {
      setHelp("このスマホ/ブラウザはバーコード読取に未対応です。AndroidのChrome最新版で試してください。手入力は使えます。");
      return;
    }

    detector = new BarcodeDetector({
      formats: ["ean_13", "ean_8", "code_128", "code_39", "code_93", "itf", "qr_code", "upc_a", "upc_e"]
    });

    $("cameraBox").hidden = false;
    $("stopScanBtn").hidden = false;
    setHelp("カメラをバーコードに近づけてください。読み取ると自動で止まります。");

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });

    const video = $("preview");
    video.srcObject = stream;
    await video.play();
    scanning = true;
    scanLoop();
  } catch (err) {
    stopScan();
    if (location.protocol === "file:") {
      setHelp("ファイルを直接開くとカメラが起動しない場合があります。Chromeで開く、またはHTTPS/localhostに置いて使ってください。");
    } else {
      setHelp("カメラを起動できませんでした。ブラウザのカメラ許可をオンにしてください。");
    }
  }
}

async function scanLoop() {
  if (!scanning) return;
  try {
    const video = $("preview");
    const codes = await detector.detect(video);
    if (codes && codes.length > 0) {
      $("barcode").value = codes[0].rawValue;
      stopScan();
      $("name").focus();
      showMessage("バーコードを読み取りました");
      return;
    }
  } catch (e) {
    // 読取失敗時は次のフレームで再試行
  }
  scanTimer = setTimeout(scanLoop, 250);
}

function stopScan() {
  scanning = false;
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = null;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  $("preview").srcObject = null;
  $("cameraBox").hidden = true;
  $("stopScanBtn").hidden = true;
}

$("scanBtn").addEventListener("click", startCameraScan);
$("stopScanBtn").addEventListener("click", stopScan);

render();
