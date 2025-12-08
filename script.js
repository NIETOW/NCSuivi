// ==========================================================
// 1. CONFIGURATION FIREBASE
// ==========================================================
const firebaseConfig = {
    apiKey: "AIzaSyBXHDVlKWjQ4u8OqJZ8YqN1bEciRoSgnM4",
    authDomain: "ncsuivi.firebaseapp.com",
    projectId: "ncsuivi",
    storageBucket: "ncsuivi.firebasestorage.app",
    messagingSenderId: "29994111172",
    appId: "1:29994111172:web:e5c9161149957c25f8fb09",
    measurementId: "G-N5ME2KVF2K"
};
const app = firebase.initializeApp(firebaseConfig);
const db = app.firestore();
const STOCK_COLLECTION = 'ordinateurs';

// ==========================================================
// 2. ETAT GLOBAL
// ==========================================================
let currentPcId = null; 
let currentPcData = null; 
let tempPiecesList = []; 

const formatEuro = (val) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(val || 0);
const formatId = (id) => 'N' + id.toString().padStart(4, '0');
const el = (id) => document.getElementById(id);

function showMessage(msg, isError = false) {
    const box = el('message') || el('detailMessage');
    if (box) {
        box.textContent = msg;
        box.style.color = isError ? 'var(--color-danger)' : 'var(--color-primary)';
        setTimeout(() => box.textContent = '', 3500);
    }
}

// ==========================================================
// 3. FIRESTORE
// ==========================================================
async function getStock() {
    try {
        const snapshot = await db.collection(STOCK_COLLECTION).orderBy('id_ordinateur', 'desc').get();
        return snapshot.docs.map(doc => ({ firestoreId: doc.id, ...doc.data() }));
    } catch (err) {
        console.error("Erreur lecture:", err);
        return [];
    }
}

async function getPcById(id) {
    const snapshot = await db.collection(STOCK_COLLECTION).where('id_ordinateur', '==', id).get();
    if (snapshot.empty) return null;
    return { firestoreId: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

// ==========================================================
// 4. LOGIQUE INDEX.HTML (RAPPORTS & VENTES)
// ==========================================================
async function renderDashboard() {
    if (!el('inventaireBody')) return;
    
    const stock = await getStock();
    const tbody = el('inventaireBody');
    tbody.innerHTML = '';

    let stats = { stock: 0, sold: 0, ca: 0, depenses: 0, benef: 0 };
    const itemsToDisplay = stock.filter(pc => pc.statut !== 'En Préparation');

    itemsToDisplay.forEach(pc => {
        // Calculs de base
        const prixAchat = Number(pc.prix_achat) || 0;
        const coutPieces = (pc.pieces || []).reduce((sum, p) => sum + (Number(p.prix) || 0), 0);
        const coutTotal = prixAchat + coutPieces;
        const isSold = pc.statut === 'Vendu';
        
        // Détermination du prix de revente et de la marge pour l'affichage
        const prixRevente = isSold ? (Number(pc.prix_vente_final) || 0) : (Number(pc.prix_revente_estime) || 0);
        const marge = prixRevente - coutTotal;
        const margeClass = marge > 0 ? 'marge-positive' : (marge < 0 ? 'marge-negative' : '');

        // Mise à jour des Stats
        stats.depenses += coutTotal; 

        if (isSold) {
            stats.sold++;
            stats.ca += prixRevente;
            stats.benef += marge;
        } else { // Statut "En Vente"
            stats.stock++;
        }

        // RENDU DE LA TABLE (AVEC data-label)
        
        let prixDisplay = isSold ? formatEuro(pc.prix_vente_final) : formatEuro(pc.prix_revente_estime) + ' (Est.)';
        let statutBadge = isSold ? '<span class="badge badge-sold">Vendu</span>' : '<span class="badge badge-stock">En Vente</span>';
        
        let actionsHtml = '';
        if (!isSold) {
            actionsHtml = `
                <button class="action-button btn-vendre" onclick="openSaleModal(${pc.id_ordinateur})">Vendre</button>
                <button class="action-button btn-modifier-suivi" onclick="openEditModal(${pc.id_ordinateur})">Modifier</button>
            `;
        } else {
            actionsHtml = `<button class="action-button btn-secondary" onclick="openEditModal(${pc.id_ordinateur})">Détails</button>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Réf">${formatId(pc.id_ordinateur)}</td>
            <td data-label="Nom du PC"><strong>${pc.nom_pc}</strong><br><small style="color:#666">${pc.caracteristiques}</small></td>
            <td data-label="Coût Total">${formatEuro(coutTotal)} <small>(${formatEuro(coutPieces)} pcs)</small></td>
            <td data-label="Prix Vente">${prixDisplay}</td>
            <td data-label="Marge" class="${margeClass}">${formatEuro(marge)}</td>
            <td data-label="Statut">${statutBadge}</td>
            <td data-label="Actions"><div class="action-buttons-wrapper">${actionsHtml}</div></td>
        `;
        tbody.appendChild(tr);
    });

    // Mise à jour des Stats DOM
    el('statsStockCount').textContent = stats.stock;
    el('statsSoldCount').textContent = stats.sold;
    el('statsTotalRevenue').textContent = formatEuro(stats.ca);
    el('statsTotalCost').textContent = formatEuro(stats.depenses);
    el('statsTotalProfit').textContent = formatEuro(stats.benef);
    el('statsTotalProfit').className = 'stat-value ' + (stats.benef >= 0 ? 'profit-positive' : 'profit-negative');

    // Message si la table est vide
    if (itemsToDisplay.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">Aucun PC prêt à la vente ou vendu.</td></tr>';
    }
}

// ==========================================================
// 5. LOGIQUE STOCK.HTML (ATELIER) & AJOUT
// ==========================================================

// GESTION DU FORMULAIRE D'AJOUT (dans stock.html)
if (el('addPcForm')) {
    el('addPcForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const stock = await getStock();
        const maxId = stock.reduce((max, p) => Math.max(max, p.id_ordinateur || 0), 0);
        
        const newPc = {
            id_ordinateur: maxId + 1,
            nom_pc: el('nomPc').value.trim(),
            caracteristiques: el('caracteristiques').value.trim(),
            prix_achat: parseFloat(el('prixAchat').value),
            prix_revente_estime: parseFloat(el('prixRevente').value),
            statut: 'En Préparation',
            pieces: [],
            problemes: ''
        };

        await db.collection(STOCK_COLLECTION).add(newPc);
        el('addPcForm').reset();
        showMessage("✅ PC ajouté à l'atelier !");
        
        if (el('stockDetailBody')) renderRepairs();
    });
}

async function renderRepairs() {
    if (!el('stockDetailBody')) return;
    
    const stock = await getStock();
    const tbody = el('stockDetailBody');
    tbody.innerHTML = '';

    const repairs = stock.filter(pc => pc.statut === 'En Préparation');

    if (repairs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Aucun PC en atelier. Utilisez le formulaire ci-dessus.</td></tr>';
        return;
    }

    repairs.forEach(pc => {
        const pieces = pc.pieces || [];
        const coutPieces = pieces.reduce((acc, p) => acc + (Number(p.prix) || 0), 0);
        const total = (Number(pc.prix_achat)||0) + coutPieces;

        // NOUVEAU: Détermination de la classe de couleur (Code Couleur)
        const prixEstime = Number(pc.prix_revente_estime) || 0;
        const totalCostClass = prixEstime > total ? 'marge-positive' : (prixEstime < total ? 'marge-negative' : '');
        
        // NOUVEAU: Ajout de l'aperçu des pièces (Détail des Coûts des Pièces)
        const pieceNamesList = pieces.map(p => p.nom).join(', ') || 'Aucune pièce';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Réf">${formatId(pc.id_ordinateur)}</td>
            <td data-label="Nom du PC"><strong>${pc.nom_pc}</strong></td>
            <td data-label="Problèmes / Notes" style="color: #666; font-style: italic;">${pc.problemes || 'R.A.S.'}</td>
            <td data-label="Coût Pièces">${formatEuro(coutPieces)} <small>(${pieces.length} pcs)</small><br><small style="color: #999;">${pieceNamesList}</small></td> <td data-label="Coût Total" class="${totalCostClass}"><strong>${formatEuro(total)}</strong></td> <td data-label="Actions">
                <div class="action-buttons-wrapper">
                    <button class="action-button btn-vendre" onclick="moveToSale('${pc.firestoreId}')">Mettre en Vente</button>
                    <button class="action-button btn-modifier-suivi" onclick="openSuiviModal(${pc.id_ordinateur})">🛠️ Pièces</button>
                    <button class="action-button btn-secondary" onclick="openEditModal(${pc.id_ordinateur})">Infos</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// REMPLACÉ: Ancienne fonction moveToSale (avec confirm natif)
// NOUVEAU: Gère la vérification des pièces et ouvre la modale personnalisée
async function moveToSale(firestoreId) {
    currentPcData = (await db.collection(STOCK_COLLECTION).doc(firestoreId).get()).data();
    currentPcData.firestoreId = firestoreId; 
    
    if (!currentPcData) return;

    // NOUVEAU: Vérification des pièces non reçues
    const piecesNonRecues = (currentPcData.pieces || []).filter(p => p.ordered && !p.received);
    
    if (piecesNonRecues.length > 0) {
        const pieceNames = piecesNonRecues.map(p => p.nom).join(', ');
        alert(`Attention ! Le PC possède encore ${piecesNonRecues.length} pièce(s) commandée(s) mais non reçue(s) : ${pieceNames}. Veuillez d'abord finaliser le suivi.`);
        return; // Stoppe l'action si des pièces manquent
    }

    el('confirmSalePcName').textContent = `${currentPcData.nom_pc} (${formatId(currentPcData.id_ordinateur)})`;
    el('confirmSaleModal').style.display = 'block';

    // Associer la fonction de confirmation au bouton de la modale
    el('confirmTransferBtn').onclick = async () => {
        await performMoveToSale(firestoreId);
    };
}

// NOUVEAU: Exécute le transfert après la confirmation
async function performMoveToSale(firestoreId) {
    try {
        await db.collection(STOCK_COLLECTION).doc(firestoreId).update({ statut: 'En Vente' });
        closeAllModals(); // Ferme la modale personnalisée
        if(el('stockDetailBody')) renderRepairs(); 
        showMessage("✅ Transféré en boutique !");
    } catch(e) { 
        console.error(e); 
        closeAllModals();
        showMessage("Erreur lors du transfert", true);
    }
}

// ==========================================================
// 6. MODALES & SUIVI
// ==========================================================
function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    currentPcData = null;
    currentPcId = null;
}

// ... openSaleModal, openEditModal (unchanged) ...
async function openSaleModal(id) {
    currentPcData = await getPcById(id);
    if (!currentPcData) return;
    el('saleModalPcName').textContent = `${currentPcData.nom_pc} (${formatId(id)})`;
    el('finalSalePrice').value = currentPcData.prix_revente_estime || '';
    el('saleModal').style.display = 'block';
    el('finalSalePrice').focus();
    el('confirmSaleBtn').onclick = async () => {
        const price = parseFloat(el('finalSalePrice').value);
        if (!price || price < 0) return alert("Prix invalide");
        await db.collection(STOCK_COLLECTION).doc(currentPcData.firestoreId).update({
            statut: 'Vendu', prix_vente_final: price, date_vente: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeAllModals(); renderDashboard();
    };
}

async function openEditModal(id) {
    currentPcData = await getPcById(id);
    if (!currentPcData) return;
    el('editModalPcName').textContent = formatId(id);
    el('editNomPc').value = currentPcData.nom_pc;
    el('editSpecs').value = currentPcData.caracteristiques;
    el('editPrixAchat').value = currentPcData.prix_achat;
    el('editPrixEstime').value = currentPcData.prix_revente_estime;
    const isSold = currentPcData.statut === 'Vendu';
    el('editSaleSection').style.display = isSold ? 'block' : 'none';
    if(isSold) el('editPrixVenteFinal').value = currentPcData.prix_vente_final;
    el('editModal').style.display = 'block';

    el('saveEditBtn').onclick = async () => {
        const updates = {
            nom_pc: el('editNomPc').value, caracteristiques: el('editSpecs').value,
            prix_achat: parseFloat(el('editPrixAchat').value), prix_revente_estime: parseFloat(el('editPrixEstime').value)
        };
        if(isSold) updates.prix_vente_final = parseFloat(el('editPrixVenteFinal').value);
        await db.collection(STOCK_COLLECTION).doc(currentPcData.firestoreId).update(updates);
        closeAllModals(); 
        if(el('inventaireBody')) renderDashboard(); 
        if(el('stockDetailBody')) renderRepairs();
    };

    el('cancelSaleBtn').onclick = async () => {
        if(!confirm("Remettre en vente ?")) return;
        await db.collection(STOCK_COLLECTION).doc(currentPcData.firestoreId).update({
            statut: 'En Vente', prix_vente_final: firebase.firestore.FieldValue.delete(), date_vente: firebase.firestore.FieldValue.delete()
        });
        closeAllModals(); renderDashboard();
    };

    el('deletePcBtn').onclick = async () => {
        if(!confirm("SUPPRIMER ?")) return;
        await db.collection(STOCK_COLLECTION).doc(currentPcData.firestoreId).delete();
        closeAllModals(); 
        if(el('inventaireBody')) renderDashboard(); 
        if(el('stockDetailBody')) renderRepairs();
    };
}

async function openSuiviModal(id) {
    currentPcData = await getPcById(id);
    if (!currentPcData) return;
    el('suiviPcName').textContent = currentPcData.nom_pc;
    el('suiviProblemes').value = currentPcData.problemes || '';
    // Initialise les nouveaux champs si non présents (compatibilité)
    tempPiecesList = currentPcData.pieces ? currentPcData.pieces.map(p => ({
        ...p,
        ordered: p.ordered !== undefined ? p.ordered : false,
        received: p.received !== undefined ? p.received : false,
        lien: p.lien !== undefined ? p.lien : '' // NOUVEAU: Initialisation du lien
    })) : [];
    renderPiecesList();
    el('suiviModal').style.display = 'block';
}

/**
 * Fonctions de gestion du statut des pièces
 */
function togglePieceOrdered(index) {
    const piece = tempPiecesList[index];
    piece.ordered = !piece.ordered;
    // Si on annule la commande, on annule aussi la réception
    if (!piece.ordered) {
        piece.received = false;
    }
    renderPiecesList();
}

function togglePieceReceived(index) {
    const piece = tempPiecesList[index];
    
    // Si la pièce n'est pas commandée, on ne peut pas la recevoir (sauf pour annuler la réception)
    if (!piece.ordered && !piece.received) return alert("Veuillez d'abord marquer la pièce comme commandée.");

    piece.received = !piece.received;
    
    // Si la pièce est marquée comme reçue, elle doit être commandée
    if (piece.received && !piece.ordered) {
        piece.ordered = true;
    }

    renderPiecesList();
}


function renderPiecesList() {
    const container = el('piecesListContainer');
    container.innerHTML = '';
    let total = 0;
    if (tempPiecesList.length === 0) container.innerHTML = '<p style="text-align:center; color:#999">Aucune pièce.</p>';
    else {
        tempPiecesList.forEach((piece, index) => {
            total += Number(piece.prix);
            
            const isOrdered = piece.ordered;
            const isReceived = piece.received;

            const orderedText = isOrdered ? 'Annuler Cde' : 'Commander';
            const orderedClass = isOrdered ? 'btn-annuler' : 'btn-primary';
            
            const receivedText = isReceived ? 'Annuler Réception' : 'Reçu';
            const receivedClass = isReceived ? 'btn-warning' : 'btn-vendre'; // Changé en btn-vendre pour le succès
            const receivedDisabled = !isOrdered && !isReceived; // On ne peut pas recevoir si non commandé et non reçu

            const statusText = isReceived ? '✅ Reçu' : (isOrdered ? '⏳ Commandé' : '❌ Non Cde');
            
            // CORRIGÉ ET STYLISÉ: Affichage du lien sous forme de bouton
            const linkHtml = piece.lien ? 
                `<a href="${piece.lien}" target="_blank" style="text-decoration: none;">
                    <button class="btn-small btn-secondary">Lien</button>
                </a>` : '';

            const div = document.createElement('div');
            div.className = 'piece-item';
            div.innerHTML = `
                <span>${piece.nom}</span>
                <div class="piece-actions">
                    ${linkHtml} <span class="piece-status">${statusText}</span>
                    <strong>${formatEuro(piece.prix)}</strong>
                    <button class="btn-small ${orderedClass}" onclick="togglePieceOrdered(${index})">${orderedText}</button>
                    <button class="btn-small ${receivedClass}" ${receivedDisabled ? 'disabled' : ''} onclick="togglePieceReceived(${index})">${receivedText}</button>
                    <button class="btn-small btn-supprimer" onclick="removePiece(${index})">X</button>
                </div>
            `;
            container.appendChild(div);
        });
    }
    el('totalPiecesCost').textContent = formatEuro(total);
}

function addPieceToUI() {
    const nom = el('newPieceName').value.trim();
    const prix = parseFloat(el('newPiecePrice').value);
    const lien = el('newPieceLink').value.trim(); // NOUVEAU: Récupération du lien
    
    if (!nom || isNaN(prix) || prix <= 0) return alert("Nom ou prix invalide.");
    
    // Ajout des nouveaux champs de statut et du lien
    tempPiecesList.push({ nom, prix, ordered: false, received: false, lien: lien }); 
    
    el('newPieceName').value = ''; 
    el('newPiecePrice').value = '';
    el('newPieceLink').value = ''; // NOUVEAU: Reset du champ
    renderPiecesList();
}

function removePiece(index) {
    tempPiecesList.splice(index, 1);
    renderPiecesList();
}

async function saveSuiviData() {
    if (!currentPcData) return;
    await db.collection(STOCK_COLLECTION).doc(currentPcData.firestoreId).update({
        problemes: el('suiviProblemes').value.trim(), pieces: tempPiecesList
    });
    closeAllModals(); renderRepairs(); showMessage("✅ Suivi mis à jour");
}

function filterStock() {
    const term = el('searchInput').value.toLowerCase();
    document.querySelectorAll('#inventaireBody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(term) ? '' : 'none');
}
function filterStockDetail() {
    const term = el('stockSearchInput').value.toLowerCase();
    document.querySelectorAll('#stockDetailBody tr').forEach(r => r.style.display = r.innerText.toLowerCase().includes(term) ? '' : 'none');
}

// ==========================================================
// 7. INIT & EXPOSITION
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
    if (el('inventaireBody')) renderDashboard();
    if (el('stockDetailBody')) renderRepairs();
    window.onclick = (e) => { if (e.target.classList.contains('modal')) closeAllModals(); };
});

window.openSaleModal = openSaleModal;
window.openEditModal = openEditModal;
window.openSuiviModal = openSuiviModal;
window.closeAllModals = closeAllModals;
window.addPieceToUI = addPieceToUI;
window.removePiece = removePiece;
window.saveSuiviData = saveSuiviData;
window.filterStock = filterStock;
window.filterStockDetail = filterStockDetail;
window.moveToSale = moveToSale;
window.performMoveToSale = performMoveToSale; // NOUVEAU
window.togglePieceOrdered = togglePieceOrdered;
window.togglePieceReceived = togglePieceReceived;