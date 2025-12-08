// ==========================================================
// 1. CONFIGURATION ET INITIALISATION DE FIREBASE
// ==========================================================
const firebaseConfig = {
    apiKey: "AIzaSyBXHDVlKWjQ4u8OqJZ8YqN1bEciRoSgnM4",
    authDomain: "ncsuivi.firebaseapp.com",
    projectId: "ncsuivi",
    storageBucket: "ncsuivi.firebasestorage.app",
    messagingSenderId: "29994112172",
    appId: "1:29994112172:web:e5c9162149957c25f8fb09",
    measurementId: "G-N5ME2KVF2K"
};
const app = firebase.initializeApp(firebaseConfig);
const db = app.firestore();
const STOCK_COLLECTION = 'ordinateurs';

let currentPcId = null;

// --- Cache et utilitaires ---
let _stockCache = { data: null, ts: 0 };
const CACHE_TTL = 5000; // ms
let isProcessing = false;

function safeGetEl(id) {
    return document.getElementById(id);
}

function showMessage(text, timeout = 3500) {
    const el = safeGetEl('message');
    if (!el) return;
    el.textContent = text;
    if (timeout) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, timeout);
}

function debounce(fn, wait) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

// --- FORMATS UTILES ---
function formatInventoryId(id) {
    return 'N' + id.toString().padStart(4, '0');
}

const formatEuro = (value) => value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

// ==========================================================
// 2. FONCTIONS FIRESTORE
// ==========================================================
async function getStock() {
    try {
        const now = Date.now();
        if (_stockCache.data && (now - _stockCache.ts) < CACHE_TTL) {
            return _stockCache.data;
        }
        const snapshot = await db.collection(STOCK_COLLECTION).orderBy('id_ordinateur').get();
        const data = snapshot.docs.map(doc => ({ ...doc.data(), firestore_id: doc.id }));
        _stockCache = { data, ts: Date.now() };
        return data;
    } catch (err) {
        console.error("Erreur récupération stock:", err);
        showMessage("Erreur récupération stock (voir console)");
        return [];
    }
}

async function savePc(pcData) {
    const { firestore_id, ...dataToSave } = pcData;
    // Forcer types numériques pour éviter string en base
    if (dataToSave.prix_achat !== undefined) dataToSave.prix_achat = Number(dataToSave.prix_achat) || 0;
    if (dataToSave.prix_revente_estime !== undefined) dataToSave.prix_revente_estime = Number(dataToSave.prix_revente_estime) || 0;
    if (dataToSave.prix_vente_final !== undefined) dataToSave.prix_vente_final = Number(dataToSave.prix_vente_final) || null;

    try {
        if (firestore_id) {
            await db.collection(STOCK_COLLECTION).doc(firestore_id).update(dataToSave);
            _stockCache.ts = 0; // invalider cache
            return firestore_id;
        } else {
            const ref = await db.collection(STOCK_COLLECTION).add(dataToSave);
            _stockCache.ts = 0;
            return ref.id;
        }
    } catch (err) {
        console.error("Erreur sauvegarde PC:", err);
        showMessage("Erreur lors de la sauvegarde (voir console)");
        throw err;
    }
}

function getNextId(stock) {
    const maxId = stock.reduce((max, pc) => pc.id_ordinateur > max ? pc.id_ordinateur : max, 0);
    return maxId + 1;
}

// ==========================================================
// 3. DASHBOARD ET RENDU
// ==========================================================
async function updateDashboard() {
    const stock = await getStock();
    let soldCount = 0, stockCount = 0, totalExpenses = 0, totalRevenue = 0, totalProfit = 0;

    stock.forEach(pc => {
        const prixAchat = Number(pc.prix_achat) || 0;
        const prixVenteFinal = Number(pc.prix_vente_final) || 0;

        if (pc.statut === 'En Stock') stockCount++;
        else if (pc.statut === 'Vendu') soldCount++;

        totalExpenses += prixAchat;
        if (pc.statut === 'Vendu') {
            totalRevenue += prixVenteFinal;
            totalProfit += prixVenteFinal - prixAchat;
        }
    });

    document.getElementById('statsStockCount').textContent = stockCount;
    document.getElementById('statsSoldCount').textContent = soldCount;
    document.getElementById('statsTotalCost').textContent = formatEuro(totalExpenses);
    document.getElementById('statsTotalRevenue').textContent = formatEuro(totalRevenue);

    const profitEl = document.getElementById('statsTotalProfit');
    profitEl.textContent = formatEuro(totalProfit);
    profitEl.classList.remove('profit-positive', 'profit-negative');
    if (totalProfit > 0) profitEl.classList.add('profit-positive');
    else if (totalProfit < 0) profitEl.classList.add('profit-negative');
}

// ==========================================================
// 4. AJOUT D'UN PC
// ==========================================================
async function addPc(event) {
    event.preventDefault();
    const nomPc = document.getElementById('nomPc').value.trim();
    const caracteristiques = document.getElementById('caracteristiques').value.trim();
    const prixAchat = parseFloat(document.getElementById('prixAchat').value);
    const prixRevente = parseFloat(document.getElementById('prixRevente').value);

    if (!nomPc || !caracteristiques || isNaN(prixAchat) || isNaN(prixRevente) || prixAchat <= 0 || prixRevente <= 0) {
        document.getElementById('message').textContent = "❌ Veuillez remplir tous les champs correctement.";
        return;
    }

    const fullStock = await getStock();
    const nextId = getNextId(fullStock);

    const newPc = {
        id_ordinateur: nextId,
        nom_pc: nomPc,
        caracteristiques,
        prix_achat: prixAchat,
        prix_revente_estime: prixRevente,
        statut: 'En Stock'
    };

    await savePc(newPc);
    document.getElementById('addPcForm').reset();
    renderStock();
    updateDashboard();
    document.getElementById('message').textContent = `✅ PC ajouté ! N° ${formatInventoryId(nextId)}`;
}

// ==========================================================
// 5. GESTION DE LA MODALE DE VENTE
// ==========================================================
function openSaleModal(id) {
    currentPcId = id;
    db.collection(STOCK_COLLECTION).where('id_ordinateur', '==', id).get().then(snapshot => {
        if (snapshot.empty) return;
        const pcDoc = snapshot.docs[0];
        const pc = { ...pcDoc.data(), firestore_id: pcDoc.id };
        document.getElementById('modalPcName').textContent = `${pc.nom_pc} (N° ${formatInventoryId(pc.id_ordinateur)})`;
        document.getElementById('modalPcCost').textContent = formatEuro(pc.prix_achat);
        document.getElementById('modalPcEstimatedPrice').textContent = formatEuro(pc.prix_revente_estime);
        const input = document.getElementById('finalSalePrice');
        input.value = pc.statut === 'Vendu' && pc.prix_vente_final ? pc.prix_vente_final.toFixed(2) : pc.prix_revente_estime.toFixed(2);
        document.getElementById('modalMessage').textContent = '';
        document.getElementById('saleModal').style.display = 'block';
        input.focus();
    });
}

function closeSaleModal() {
    document.getElementById('saleModal').style.display = 'none';
    currentPcId = null;
}

async function processSale() {
    if (currentPcId === null) return;
    if (isProcessing) return;
    isProcessing = true;
    const modalMsg = safeGetEl('modalMessage');
    const saveBtn = safeGetEl('modalSaveButton');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const finalPrice = parseFloat(safeGetEl('finalSalePrice').value);
        if (isNaN(finalPrice) || finalPrice <= 0) { if (modalMsg) modalMsg.textContent = "❌ Prix invalide"; return; }

        const snapshot = await db.collection(STOCK_COLLECTION).where('id_ordinateur', '==', currentPcId).get();
        if (snapshot.empty) { if (modalMsg) modalMsg.textContent = "❌ Article introuvable"; return; }
        const docRef = snapshot.docs[0].ref;

        await docRef.update({
            statut: 'Vendu',
            prix_vente_final: finalPrice,
            // stocker timestamp serveur (plus fiable que toLocaleDateString)
            date_vente: firebase.firestore.FieldValue.serverTimestamp()
        });

        _stockCache.ts = 0;
        if (modalMsg) modalMsg.textContent = `✅ Vente enregistrée !`;
        await renderStock();
        await updateDashboard();
        setTimeout(closeSaleModal, 900);
    } catch (err) {
        console.error("Erreur lors du traitement de la vente:", err);
        if (modalMsg) modalMsg.textContent = "Erreur lors de l'enregistrement (voir console)";
    } finally {
        isProcessing = false;
        if (saveBtn) saveBtn.disabled = false;
    }
}

// ==========================================================
// 6. GESTION DE LA MODALE DE SUPPRESSION
// ==========================================================
async function openDeleteModal(id) {
    const snapshot = await db.collection(STOCK_COLLECTION).where('id_ordinateur', '==', id).get();
    if (snapshot.empty) return;
    const pcDoc = snapshot.docs[0];
    currentPcId = id;
    document.getElementById('modalDeletePcInfo').textContent = `${pcDoc.data().nom_pc} (N° ${formatInventoryId(pcDoc.data().id_ordinateur)})`;
    document.getElementById('deleteModal').style.display = 'block';
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    currentPcId = null;
}

async function confirmDeletePc() {
    if (currentPcId === null) return;
    if (isProcessing) return;
    isProcessing = true;
    const deleteBtn = safeGetEl('modalConfirmDeleteButton');
    if (deleteBtn) deleteBtn.disabled = true;

    try {
        const snapshot = await db.collection(STOCK_COLLECTION).where('id_ordinateur', '==', currentPcId).get();
        if (snapshot.empty) { showMessage("Article introuvable"); return; }
        await db.collection(STOCK_COLLECTION).doc(snapshot.docs[0].id).delete();
        _stockCache.ts = 0;
        closeDeleteModal();
        await renderStock();
        await updateDashboard();
        showMessage(`✅ Article N° ${formatInventoryId(currentPcId)} supprimé.`);
    } catch (err) {
        console.error("Erreur suppression:", err);
        showMessage("Erreur suppression (voir console)");
    } finally {
        isProcessing = false;
        if (deleteBtn) deleteBtn.disabled = false;
    }
}

// ==========================================================
// 7. FILTRAGE ET RENDU
// ==========================================================
async function filterStock() {
    const term = safeGetEl('searchInput').value.toLowerCase().trim();
    const fullStock = await getStock();
    if (!term) { renderStock(fullStock); return; }

    const filtered = fullStock.filter(pc => {
        const idFormat = formatInventoryId(pc.id_ordinateur).toLowerCase();
        return (pc.nom_pc || '').toLowerCase().includes(term) ||
            (pc.caracteristiques || '').toLowerCase().includes(term) ||
            idFormat.includes(term);
    });
    renderStock(filtered);
}

async function renderStock(data = null) {
    if (!data) data = await getStock();
    const tbody = document.getElementById('inventaireBody');
    tbody.innerHTML = '';
    if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="7">Aucun ordinateur trouvé.</td></tr>'; return; }

    data.forEach(pc => {
        const statutClass = pc.statut.replace(/\s/g, '');
        const prixAchat = Number(pc.prix_achat) || 0;
        const prixReventeEstime = Number(pc.prix_revente_estime) || 0;

        let margeText = 'N/A', margeClass = 'marge-nulle';
        if (pc.statut === 'Vendu' && pc.prix_vente_final) {
            const marge = pc.prix_vente_final - prixAchat;
            margeText = formatEuro(marge).replace('€', '');
            margeClass = marge > 0 ? 'marge-positive' : marge < 0 ? 'marge-negative' : 'marge-nulle';
        } else if (pc.statut === 'En Stock') {
            const margePot = prixReventeEstime - prixAchat;
            margeText = `${formatEuro(margePot).replace('€', '')} (Est.)`;
            margeClass = 'marge-estimee';
        }

        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${formatInventoryId(pc.id_ordinateur)}</td>
            <td><strong>${pc.nom_pc}</strong></td>
            <td>${formatEuro(prixAchat)}</td>
            <td>${formatEuro(prixReventeEstime)}</td>
            <td class="${margeClass}">${margeText}</td>
            <td class="statut-${statutClass}">${pc.statut}</td>
            <td>
                ${pc.statut === 'En Stock' ?
                `<button class="action-button btn-vendre" onclick="openSaleModal(${pc.id_ordinateur})">Vendre</button>` :
                `Vendu (${pc.date_vente || new Date().toLocaleDateString('fr-FR')}) <button class="action-button btn-vendre" style="font-size:0.8em; padding:2px 5px;" onclick="openSaleModal(${pc.id_ordinateur})">Modifier Prix</button>`
            }
                <button class="action-button btn-supprimer" onclick="openDeleteModal(${pc.id_ordinateur})">Supprimer</button>
            </td>
        `;
    });
}

// ==========================================================
// 8. INITIALISATION
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
    renderStock();
    updateDashboard();
    document.getElementById('addPcForm').addEventListener('submit', addPc);
    // Debounce la recherche pour éviter trop de recalculs / lectures
    document.getElementById('searchInput').addEventListener('input', debounce(filterStock, 250));

    const saleModal = document.getElementById('saleModal');
    const deleteModal = document.getElementById('deleteModal');

    window.addEventListener('click', e => {
        if (e.target === saleModal) closeSaleModal();
        else if (e.target === deleteModal) closeDeleteModal();
    });

    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (saleModal.style.display === 'block') closeSaleModal();
            else if (deleteModal.style.display === 'block') closeDeleteModal();
        }
    });

    document.getElementById('modalSaveButton').addEventListener('click', processSale);
    document.getElementById('modalConfirmDeleteButton').addEventListener('click', confirmDeletePc);

    // Gestion fermeture bouton X modales
    document.querySelectorAll('.close-button').forEach(btn => {
        btn.addEventListener('click', () => {
            closeSaleModal();
            closeDeleteModal();
        });
    });
});

// --- Exposer fonctions au global ---
window.openSaleModal = openSaleModal;
window.closeSaleModal = closeSaleModal;
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDeletePc = confirmDeletePc;
window.filterStock = filterStock;
