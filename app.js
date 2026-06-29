const DB_KEY = 'zaikoProDataV1';
let data = JSON.parse(localStorage.getItem(DB_KEY) || '{"products":[],"history":[]}');
let currentProduct = null;
let stream = null;
let detector = null;
let scanning = false;
let zxingReader = null;

const $ = id => document.getElementById(id);
const saveDB = () => localStorage.setItem(DB_KEY, JSON.stringify(data));
const now = () => new Date().toLocaleString('ja-JP');
const toast = msg => { const t=$('toast'); t.textContent=msg; t.style.display='block'; setTimeout(()=>t.style.display='none',2200); };

function csvEscape(v){ return '"' + String(v ?? '').replaceAll('"','""') + '"'; }
function downloadCSV(filename, rows){
  const csv = rows.map(r=>r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
function exportStock(){
  downloadCSV('zaiko_stock.csv', [['バーコード','商品名','SKU','在庫数','保管場所'], ...data.products.map(p=>[p.barcode,p.name,p.sku,p.stock,p.location])]);
}
function exportHistory(){
  downloadCSV('zaiko_history.csv', [['日時','処理','バーコード','商品名','数量','処理前','処理後','メモ'], ...data.history.map(h=>[h.date,h.action,h.barcode,h.name,h.qty,h.before,h.after,h.memo])]);
}
function exportAll(){ exportStock(); setTimeout(exportHistory, 400); }

function setView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  $(id).classList.add('active'); document.querySelector(`[data-view="${id}"]`).classList.add('active');
  render();
}

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>setView(b.dataset.view));

function findProduct(barcode){ return data.products.find(p => p.barcode === String(barcode).trim()); }
function selectProduct(barcode){
  const bc = String(barcode).trim();
  $('barcodeInput').value = bc;
  const p = findProduct(bc);
  if(!p){
    currentProduct = null;
    $('currentName').textContent = '未登録の商品';
    $('currentMeta').textContent = `バーコード：${bc}。商品マスタで登録してください。`;
    $('currentStock').textContent = '-';
    $('masterBarcode').value = bc;
    toast('未登録です。商品マスタにバーコードを入れました');
    return;
  }
  currentProduct = p;
  $('currentName').textContent = p.name;
  $('currentMeta').textContent = `バーコード：${p.barcode} / SKU：${p.sku || '-'} / 場所：${p.location || '-'}`;
  $('currentStock').textContent = p.stock;
  toast('商品を読み取りました');
}

function saveStock(){
  if(!currentProduct){ toast('先に商品を選択してください'); return; }
  const qty = Number($('qtyInput').value);
  if(!Number.isFinite(qty) || qty < 0){ toast('数量を入力してください'); return; }
  const action = $('actionType').value;
  const before = Number(currentProduct.stock || 0);
  let after = before;
  if(action === 'count') after = qty;
  if(action === 'in') after = before + qty;
  if(action === 'out') after = Math.max(0, before - qty);
  if(action === 'adjust') after = before + qty;
  currentProduct.stock = after;
  data.history.unshift({date:now(), action, barcode:currentProduct.barcode, name:currentProduct.name, qty, before, after, memo:$('memoInput').value});
  saveDB(); $('qtyInput').value=''; $('memoInput').value=''; selectProduct(currentProduct.barcode); render(); toast('在庫を保存しました');
}

function saveMaster(){
  const barcode = $('masterBarcode').value.trim();
  const name = $('masterName').value.trim();
  if(!barcode || !name){ toast('バーコードと商品名は必須です'); return; }
  let p = findProduct(barcode);
  if(!p){ p = {barcode, name, sku:'', stock:0, location:''}; data.products.push(p); }
  p.name = name; p.sku = $('masterSku').value.trim(); p.stock = Number($('masterStock').value || p.stock || 0); p.location = $('masterLocation').value.trim();
  saveDB(); render(); toast('商品マスタを保存しました');
}

function esc(v){
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function render(){
  $('productsTable').innerHTML = '<tr><th>バーコード</th><th>商品名</th><th>SKU</th><th>在庫</th><th>場所</th><th>削除</th></tr>' + data.products.map(p=>`<tr><td>${esc(p.barcode)}</td><td>${esc(p.name)}</td><td>${esc(p.sku||'')}</td><td>${esc(p.stock)}</td><td>${esc(p.location||'')}</td><td><button class="danger small" onclick="deleteProduct('${esc(p.barcode)}')">削除</button></td></tr>`).join('');
  const q = $('stockSearch')?.value?.toLowerCase() || '';
  const ps = data.products.filter(p => [p.barcode,p.name,p.sku,p.location].join(' ').toLowerCase().includes(q));
  $('stockTable').innerHTML = '<tr><th>バーコード</th><th>商品名</th><th>在庫</th><th>場所</th></tr>' + ps.map(p=>`<tr><td>${esc(p.barcode)}</td><td>${esc(p.name)}</td><td><b>${esc(p.stock)}</b></td><td>${esc(p.location||'')}</td></tr>`).join('');
  $('historyTable').innerHTML = '<tr><th>日時</th><th>処理</th><th>商品名</th><th>数量</th><th>前</th><th>後</th><th>メモ</th></tr>' + data.history.map(h=>`<tr><td>${esc(h.date)}</td><td>${esc(h.action)}</td><td>${esc(h.name)}</td><td>${esc(h.qty)}</td><td>${esc(h.before)}</td><td>${esc(h.after)}</td><td>${esc(h.memo||'')}</td></tr>`).join('');
}

function deleteProduct(barcode){
  const p = findProduct(barcode);
  if(!p){ toast('商品が見つかりません'); return; }
  if(!confirm(`「${p.name}」を削除しますか？`)) return;
  data.products = data.products.filter(item => item.barcode !== barcode);
  if(currentProduct && currentProduct.barcode === barcode){ currentProduct = null; $('currentName').textContent='未選択'; $('currentMeta').textContent='バーコードを読んでください'; $('currentStock').textContent='-'; }
  saveDB(); render(); toast('商品を削除しました');
}

function deleteAllProducts(){
  if(data.products.length === 0){ toast('削除する商品がありません'); return; }
  if(!confirm('商品マスタを全て削除しますか？
履歴は残ります。')) return;
  data.products = [];
  currentProduct = null;
  $('currentName').textContent='未選択'; $('currentMeta').textContent='バーコードを読んでください'; $('currentStock').textContent='-';
  saveDB(); render(); toast('商品を全て削除しました');
}

async function startScan(){
  stopScan();
  const video = $('video');
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    toast('このブラウザではカメラが使えません。Chromeで開いてください');
    return;
  }

  try{
    $('cameraStatus').textContent='カメラ起動中';

    // まずAndroidでも動きやすいZXingライブラリで読み取り
    if(window.ZXing && ZXing.BrowserMultiFormatReader){
      zxingReader = new ZXing.BrowserMultiFormatReader();
      scanning = true;
      $('cameraStatus').textContent='カメラ読取中';
      toast('カメラをバーコードに向けてください');
      await zxingReader.decodeFromVideoDevice(null, video, (result, err) => {
        if(result && scanning){
          selectProduct(result.getText());
          stopScan();
        }
      });
      return;
    }

    // CDNが読み込めない時はBarcodeDetectorで試す
    if('BarcodeDetector' in window){
      detector = new BarcodeDetector({formats:['ean_13','ean_8','code_128','qr_code','upc_a','upc_e','qr_code']});
      stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
      video.srcObject = stream;
      await video.play();
      scanning = true;
      $('cameraStatus').textContent='カメラ読取中';
      toast('カメラをバーコードに向けてください');
      loopScan();
      return;
    }

    toast('読取ライブラリを読み込めませんでした。再読み込みしてください');
    $('cameraStatus').textContent='カメラ未対応';
  }catch(e){
    console.error(e);
    $('cameraStatus').textContent='カメラエラー';
    toast('カメラ許可をオンにして、もう一度押してください');
    stopScan();
  }
}
async function loopScan(){
  if(!scanning) return;
  try{
    const codes = await detector.detect($('video'));
    if(codes.length){ selectProduct(codes[0].rawValue); stopScan(); return; }
  }catch(e){}
  requestAnimationFrame(loopScan);
}
function stopScan(){
  scanning=false;
  if(zxingReader){ try{ zxingReader.reset(); }catch(e){} zxingReader=null; }
  if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
  const video = $('video');
  if(video){ video.pause(); video.srcObject = null; }
  $('cameraStatus').textContent='カメラ停止';
}

$('findProductBtn').onclick = () => selectProduct($('barcodeInput').value);
$('saveStockBtn').onclick = saveStock;
$('saveMasterBtn').onclick = saveMaster;
$('startScanBtn').onclick = startScan;
$('stopScanBtn').onclick = stopScan;
$('exportStockBtn').onclick = exportStock;
$('exportHistoryBtn').onclick = exportHistory;
$('exportAllBtn').onclick = exportAll;
$('deleteAllProductsBtn').onclick = deleteAllProducts;
$('stockSearch').oninput = render;
render();
