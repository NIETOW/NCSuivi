// ==========================================================
// 1. CONFIGURATION ET INITIALISATION DE FIREBASE
// ==========================================================
const firebaseConfig = {
    apiKey: "AIzaSyBXHDVlKWjQ4u8OqJZ8YqN1bEciRoSgnM4",
    authDomain: "ncsuivi.firebaseapp.com",
    projectId: "ncsuivi",
    storageBucket: "ncsuivi.firebasestorage.app",
    messagingSenderId: "29994111172",
    appId: "1:29994111172:web:e5c9162149957c25f8fb09",
    measurementId: "G-N5ME2KVF2K"
};
const app = firebase.initializeApp(firebaseConfig);
const db = app.firestore();
const STOCK_COLLECTION = 'ordinateurs';

let currentPcId = null;
let currentPcFirestoreId = null; // Ajout pour stocker l'ID Firestore

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

function formatFirestoreDate(timestamp) {
    if (!timestamp || !timestamp.seconds) return 'N/A';
    return new Date(timestamp.seconds * 1000).toLocaleDateString('fr-FR');
}

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
    if (dataToSave.prix_achat !== undefined) dataToSave.prix_achat = Number(dataToToSave.prix_achat) || 0;
    if (dataToSave.prix_revente_estime !== undefined) dataToSave.prix_revente_estime = Number(dataToSave.prix_revente_estime) || 0;
    if (dataToSave.prix_vente_final !== undefined) dataToSave.prix_vente_final = Number(dataToSave.prix_vente_final) || null;

    try {
        if (firestore_id) {
            const updateData = { ...dataToSave };
            // Utiliser la fonction de suppression de champ pour les valeurs 'null'
            if (updateData.prix_vente_final === null) {
                updateData.prix_vente_final = firebase.firestore.FieldValue.delete();
            }
             if (updateData.date_vente === null) {
                updateData.date_vente = firebase.firestore.FieldValue.delete();
            }
            // S'assurer que le prix d'achat et l'estimation sont bien des nombres
            if (updateData.prix_achat !== undefined && typeof updateData.prix_achat === 'string') {
                updateData.prix_achat = parseFloat(updateData.prix_achat);
            }
             if (updateData.prix_revente_estime !== undefined && typeof updateData.prix_revente_estime === 'string') {
                updateData.prix_revente_estime = parseFloat(updateData.prix_revente_estime);
            }

            await db.collection(STOCK_COLLECTION).doc(firestore_id).update(updateData);
            _stockCache.ts = 0;
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
// 5. GESTION DE LA MODALE UNIQUE DE MODIFICATION/SUPPRESSION
// ==========================================================

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    currentPcId = null;
    currentPcFirestoreId = null;
    safeGetEl('editModalMessage').textContent = '';
}

async function openEditModal(id, isSelling = false) {
    currentPcId = id;
    safeGetEl('editModalMessage').textContent = '';

    try {
        const snapshot = await db.collection(STOCK_COLLECTION).where('id_ordinateur', '==', id).get();
        if (snapshot.empty) { showMessage("❌ Article introuvable", 3500); return; }
        
        const pcDoc = snapshot.docs[0];
        const pc = { ...pcDoc.data(), firestore_id: pcDoc.id };
        currentPcFirestoreId = pc.firestore_id;

        // Mise à jour de l'affichage de la modale
        document.getElementById('modalEditPcInfo').textContent = `${pc.nom_pc} (N° ${formatInventoryId(pc.id_ordinateur)})`;
        document.getElementById('editPrixAchat').value = pc.prix_achat ? pc.prix_achat.toFixed(2) : '0.00';
        document.getElementById('editPrixReventeEstime').value = pc.prix_revente_estime ? pc.prix_revente_estime.toFixed(2) : '0.00';

        const statusSection = safeGetEl('statusSection');
        const finalPriceInput = safeGetEl('editFinalSalePrice');
        const currentStatusEl = safeGetEl('currentStatus');

        if (pc.statut === 'Vendu' || isSelling) {
            statusSection.style.display = 'block';
            currentStatusEl.textContent = pc.statut;

            if (pc.statut === 'Vendu') {
                finalPriceInput.value = pc.prix_vente_final ? pc.prix_vente_final.toFixed(2) : pc.prix_revente_estime.toFixed(2);
                safeGetEl('cancelSaleButton').style.display = 'block';
                safeGetEl('updateSalePriceButton').textContent = 'Modifier le Prix de Vente';
            } else { // Si on vient du bouton Vendre
                finalPriceInput.value = pc.prix_revente_estime ? pc.prix_revente_estime.toFixed(2) : '0.00';
                safeGetEl('cancelSaleButton').style.display = 'none';
                safeGetEl('updateSalePriceButton').textContent = 'Enregistrer la Vente';
            }
        } else {
            statusSection.style.display = 'none';
        }

        document.getElementById('editModal').style.display = 'block';
        document.getElementById('editPrixAchat').focus();

    } catch (err) {
        console.error("Erreur ouverture modale d'édition:", err);
        showMessage("Erreur lors de l'ouverture de la modale (voir console)");
    }
}


async function processUpdate() {
    if (currentPcFirestoreId === null) return;
    if (isProcessing) return;
    isProcessing = true;

    const modalMsg = safeGetEl('editModalMessage');
    modalMsg.textContent = '';
    
    // Désactiver tous les boutons de la modale pour éviter les doubles clics
    document.querySelectorAll('#editModal button').forEach(btn => btn.disabled = true);


    try {
        const newPrixAchat = parseFloat(safeGetEl('editPrixAchat').value);
        const newPrixReventeEstime = parseFloat(safeGetEl('editPrixReventeEstime').value);

        if (isNaN(newPrixAchat) || newPrixAchat <= 0 || isNaN(newPrixReventeEstime) || newPrixReventeEstime <= 0) {
            modalMsg.textContent = "❌ Prix(s) d'achat ou d'estimation invalide(s)."; 
            return; 
        }

        const updateData = {
            prix_achat: newPrixAchat,
            prix_revente_estime: newPrixReventeEstime,
        };

        // Si la section vente est visible, vérifier et mettre à jour le prix final (même s'il est déjà vendu)
        if (safeGetEl('statusSection').style.display === 'block') {
            const finalPrice = parseFloat(safeGetEl('editFinalSalePrice').value);
            
            if (safeGetEl('updateSalePriceButton').textContent === 'Enregistrer la Vente') {
                // Cas : PC en Stock -> Vendu
                if (isNaN(finalPrice) || finalPrice <= 0) { modalMsg.textContent = "❌ Prix de vente final invalide."; return; }
                updateData.statut = 'Vendu';
                updateData.prix_vente_final = finalPrice;
                updateData.date_vente = firebase.firestore.FieldValue.serverTimestamp();
            } else if (safeGetEl('updateSalePriceButton').textContent === 'Modifier le Prix de Vente') {
                // Cas : PC Vendu -> Modification du prix final
                 if (isNaN(finalPrice) || finalPrice <= 0) { modalMsg.textContent = "❌ Prix de vente final invalide."; return; }
                 updateData.prix_vente_final = finalPrice;
            }
        }
        
        await db.collection(STOCK_COLLECTION).doc(currentPcFirestoreId).update(updateData);

        _stockCache.ts = 0;
        modalMsg.style.display = 'block';
        modalMsg.textContent = `✅ Article mis à jour !`;
        await renderStock();
        await updateDashboard();
        setTimeout(closeEditModal, 900);
        showMessage(`✅ PC N°${formatInventoryId(currentPcId)} mis à jour.`, 3500);

    } catch (err) {
        console.error("Erreur lors de la modification:", err);
        modalMsg.textContent = "Erreur lors de l'enregistrement (voir console)";
    } finally {
        isProcessing = false;
        // Réactiver les boutons
        document.querySelectorAll('#editModal button').forEach(btn => btn.disabled = false);
        
    }
}

async function cancelSale() {
    if (currentPcFirestoreId === null) return;
    if (!confirm(`Êtes-vous sûr de vouloir annuler la vente du PC N°${formatInventoryId(currentPcId)} ? Il sera remis 'En Stock'.`)) {
        return;
    }
    
    if (isProcessing) return;
    isProcessing = true;

    try {
        const docRef = db.collection(STOCK_COLLECTION).doc(currentPcFirestoreId);

        await docRef.update({
            statut: 'En Stock',
            prix_vente_final: firebase.firestore.FieldValue.delete(),
            date_vente: firebase.firestore.FieldValue.delete()
        });

        _stockCache.ts = 0;
        showMessage(`✅ Vente du PC N°${formatInventoryId(currentPcId)} annulée.`, 3500);
        closeEditModal();
        await renderStock();
        await updateDashboard();

    } catch (err) {
        console.error("Erreur annulation vente:", err);
        showMessage("Erreur lors de l'annulation de la vente (voir console)", 3500);
    } finally {
        isProcessing = false;
    }
}

async function confirmDeletePc() {
    if (currentPcFirestoreId === null) return;
    if (!confirm(`Êtes-vous sûr de vouloir supprimer définitivement le PC N°${formatInventoryId(currentPcId)} ? Cette action est irréversible.`)) {
        return;
    }
    
    if (isProcessing) return;
    isProcessing = true;

    try {
        await db.collection(STOCK_COLLECTION).doc(currentPcFirestoreId).delete();
        _stockCache.ts = 0;
        closeEditModal();
        await renderStock();
        await updateDashboard();
        showMessage(`✅ Article N° ${formatInventoryId(currentPcId)} supprimé.`, 3500);
    } catch (err) {
        console.error("Erreur suppression:", err);
        showMessage("Erreur suppression (voir console)", 3500);
    } finally {
        isProcessing = false;
    }
}


// ==========================================================
// 8. FILTRAGE ET RENDU
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
    if (!tbody) return;
    
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

        // Construction des boutons d'action SIMPLIFIÉE
        let actionButtons;
        if (pc.statut === 'En Stock') {
             actionButtons = `
                <button class="action-button btn-vendre" onclick="openEditModal(${pc.id_ordinateur}, true)">Vendre</button>
                <button class="action-button btn-modifier-suivi" onclick="openEditModal(${pc.id_ordinateur}, false)">Modifier/Infos</button>
            `;
        } else { // Vendu
            actionButtons = `
                <button class="action-button btn-modifier-suivi" onclick="openEditModal(${pc.id_ordinateur}, false)">Modifier/Infos</button>
            `;
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
                <div class="action-buttons-wrapper">${actionButtons}</div>
            </td>
        `;
    });
}

// ==========================================================
// 9. INITIALISATION
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
    // S'assurer que nous sommes sur la page index.html avant de tenter de rendre le stock principal
    if (document.getElementById('inventaireBody')) {
        renderStock();
        updateDashboard();
        if (document.getElementById('addPcForm')) document.getElementById('addPcForm').addEventListener('submit', addPc);
        if (document.getElementById('searchInput')) document.getElementById('searchInput').addEventListener('input', debounce(filterStock, 250));
        
        // --- NOUVELLES LIAISONS POUR editModal ---
        if (document.getElementById('updateCostButton')) document.getElementById('updateCostButton').addEventListener('click', processUpdate);
        if (document.getElementById('updateSalePriceButton')) document.getElementById('updateSalePriceButton').addEventListener('click', processUpdate);
        if (document.getElementById('cancelSaleButton')) document.getElementById('cancelSaleButton').addEventListener('click', cancelSale);
        if (document.getElementById('confirmDeletePcButton')) document.getElementById('confirmDeletePcButton').addEventListener('click', confirmDeletePc);
    }
    
    // Logique pour la modale unique
    const editModal = document.getElementById('editModal');

    window.addEventListener('click', e => {
        if (e.target === editModal) closeEditModal();
    });

    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (editModal && editModal.style.display === 'block') closeEditModal();
        }
    });

    document.querySelectorAll('.close-button').forEach(btn => {
        btn.addEventListener('click', () => {
            closeEditModal(); 
        });
    });
});

// --- Exposer fonctions au global ---
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.filterStock = filterStock;
// L'ancienne fonction cancelSale est maintenant interne à la modale
// La nouvelle structure simplifie l'exposition globale.