// ==========================================================
// 1. CONFIGURATION ET INITIALISATION DE FIREBASE
// ==========================================================

// Configuration Firebase (clés fournies par l'utilisateur)
const firebaseConfig = {
    apiKey: "AIzaSyBXHDVlKWjQ4u8OqJZ8YqN1bEciRoSgnM4",
    authDomain: "ncsuivi.firebaseapp.com",
    projectId: "ncsuivi",
    storageBucket: "ncsuivi.firebasestorage.app",
    messagingSenderId: "29994112172",
    appId: "1:29994112172:web:e5c9162149957c25f8fb09",
    measurementId: "G-N5ME2KVF2K" 
};
// ==========================================================

// Initialisation de Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = app.firestore();
const STOCK_COLLECTION = 'ordinateurs'; // Nom de la collection dans Firestore

// Variable globale pour stocker l'ID du PC en cours de vente/suppression
let currentPcId = null;

// --- Fonctions de base (MIGRÉES vers Firestore) ---

/**
 * Récupère le stock depuis Firestore et trie par ID.
 * Cette fonction est asynchrone et doit être appelée avec await
 */
async function getStock() {
    try {
        const snapshot = await db.collection(STOCK_COLLECTION).orderBy('id_ordinateur').get();
        // Mappe les documents Firestore en objets JavaScript
        return snapshot.docs.map(doc => ({
            ...doc.data(),
            // L'ID du document Firestore est stocké comme 'firestore_id' pour la suppression/mise à jour
            firestore_id: doc.id 
        }));
    } catch (error) {
        console.error("Erreur lors de la récupération du stock: ", error);
        return [];
    }
}

/**
 * Sauvegarde un seul PC dans Firestore (pour l'ajout, la vente ou la modification).
 * @param {object} pcData - L'objet PC à enregistrer (doit inclure firestore_id pour la mise à jour)
 */
async function savePc(pcData) {
    const { firestore_id, ...dataToSave } = pcData;
    
    try {
        if (firestore_id) {
            // Mise à jour (Vente, Modification)
            await db.collection(STOCK_COLLECTION).doc(firestore_id).update(dataToSave);
        } else {
            // Nouvel ajout
            await db.collection(STOCK_COLLECTION).add(dataToSave);
        }
    } catch (error) {
        console.error("Erreur lors de la sauvegarde du PC: ", error);
    }
}


function getNextId(stock) {
    const maxId = stock.reduce((max, pc) => pc.id_ordinateur > max ? pc.id_ordinateur : max, 0);
    // On garde la logique d'ID à partir de 1000 pour la lisibilité
    return Math.max(1000, maxId) + 1;
}

const formatEuro = (value) => value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

// ==========================================================
// 2. FONCTIONS DE GESTION (MISES À JOUR pour être asynchrones)
// ==========================================================

async function updateDashboard() {
    const stock = await getStock(); // ATTENTE des données Firestore
    
    let soldCount = 0;
    let stockCount = 0;
    let totalExpenses = 0;
    let totalRevenue = 0; 
    let totalProfit = 0; 

    stock.forEach(pc => {
        const prixAchat = typeof pc.prix_achat === 'number' ? pc.prix_achat : 0;
        const prixVenteFinal = typeof pc.prix_vente_final === 'number' ? pc.prix_vente_final : 0;

        if (pc.statut === 'En Stock') {
            stockCount++;
        } else if (pc.statut === 'Vendu') {
            soldCount++;
        }
        
        totalExpenses += prixAchat;

        if (pc.statut === 'Vendu') {
            totalRevenue += prixVenteFinal; 
            const margeReelle = prixVenteFinal - prixAchat;
            totalProfit += margeReelle;
        }
    });

    document.getElementById('statsStockCount').textContent = stockCount;
    document.getElementById('statsSoldCount').textContent = soldCount;
    document.getElementById('statsTotalCost').textContent = formatEuro(totalExpenses);
    document.getElementById('statsTotalRevenue').textContent = formatEuro(totalRevenue); 
    
    const profitElement = document.getElementById('statsTotalProfit');
    profitElement.textContent = formatEuro(totalProfit);
    
    profitElement.classList.remove('profit-positive', 'profit-negative');
    if (totalProfit > 0) {
        profitElement.classList.add('profit-positive');
    } else if (totalProfit < 0) {
        profitElement.classList.add('profit-negative');
    }
}

async function addPc(event) {
    event.preventDefault();
    
    const nomPc = document.getElementById('nomPc').value.trim();
    const caracteristiques = document.getElementById('caracteristiques').value.trim();
    const prixAchat = parseFloat(document.getElementById('prixAchat').value);
    const prixRevente = parseFloat(document.getElementById('prixRevente').value);
    
    if (!nomPc || !caracteristiques || isNaN(prixAchat) || prixAchat <= 0 || isNaN(prixRevente) || prixRevente <= 0) {
        document.getElementById('message').textContent = "❌ Erreur: Veuillez remplir tous les champs correctement avec des prix valides.";
        return;
    }

    const fullStock = await getStock(); // ATTENTE des données
    const nextId = getNextId(fullStock); 

    const newPc = {
        id_ordinateur: nextId,
        nom_pc: nomPc,
        caracteristiques: caracteristiques,
        prix_achat: prixAchat,
        prix_revente_estime: prixRevente,
        statut: 'En Stock'
    };

    await savePc(newPc); // SAUVEGARDE dans Firestore
    
    document.getElementById('addPcForm').reset();
    renderStock(); 
    updateDashboard(); 
    document.getElementById('message').textContent = `✅ PC ajouté ! N° Inventaire: ${nextId}`;
}


// --- GESTION DE LA MODALE DE VENTE ---

function openSaleModal(id) {
    currentPcId = id;
    
    // Récupère l'info du PC directement depuis Firestore
    db.collection(STOCK_COLLECTION).where('id_ordinateur', '==', id).get().then(snapshot => {
        if (!snapshot.empty) {
            const pcDoc = snapshot.docs[0];
            const pc = { ...pcDoc.data(), firestore_id: pcDoc.id };

            document.getElementById('modalPcName').textContent = pc.nom_pc;
            document.getElementById('modalPcCost').textContent = formatEuro(pc.prix_achat);
            document.getElementById('modalPcEstimatedPrice').textContent = formatEuro(pc.prix_revente_estime);
            
            const finalSalePriceInput = document.getElementById('finalSalePrice');
            
            if (pc.statut === 'Vendu' && typeof pc.prix_vente_final === 'number') {
                finalSalePriceInput.value = pc.prix_vente_final.toFixed(2);
            } else {
                finalSalePriceInput.value = pc.prix_revente_estime.toFixed(2);
            }
            
            document.getElementById('modalMessage').textContent = '';
            document.getElementById('saleModal').style.display = 'block';
            finalSalePriceInput.focus();
        }
    }).catch(error => {
        console.error("Erreur lors de l'ouverture de la modale de vente:", error);
    });
}

function closeSaleModal() {
    document.getElementById('saleModal').style.display = 'none';
    currentPcId = null;
}

async function processSale() {
    const id = currentPcId;
    if (id === null) return;

    const finalSalePriceInput = document.getElementById('finalSalePrice');
    const finalPrice = parseFloat(finalSalePriceInput.value);
    const modalMessage = document.getElementById('modalMessage');

    if (isNaN(finalPrice) || finalPrice <= 0) {
        modalMessage.textContent = "❌ Erreur: Veuillez entrer un prix de vente valide et positif.";
        return;
    }

    // 1. Récupérer le document dans Firestore
    const snapshot = await db.collection(STOCK_COLLECTION).where('id_ordinateur', '==', id).get();
    if (snapshot.empty) return;

    const pcDoc = snapshot.docs[0];
    const pc = { ...pcDoc.data(), firestore_id: pcDoc.id };

    // 2. Préparer les données de mise à jour
    const updatedData = {
        statut: 'Vendu',
        prix_vente_final: finalPrice,
        date_vente: new Date().toLocaleDateString('fr-FR')
    };
    
    // 3. Sauvegarder (Mise à jour)
    await db.collection(STOCK_COLLECTION).doc(pc.firestore_id).update(updatedData);

    // 4. Mettre à jour l'interface
    modalMessage.textContent = `✅ Vente de ${pc.nom_pc} enregistrée !`;
    
    renderStock();
    updateDashboard();

    setTimeout(closeSaleModal, 1000); 
}


// --- GESTION DE LA MODALE DE SUPPRESSION ---

async function openDeleteModal(id) {
    const snapshot = await db.collection(STOCK_COLLECTION).where('id_ordinateur', '==', id).get();
    if (snapshot.empty) return;

    const pcDoc = snapshot.docs[0];
    const pc = { ...pcDoc.data(), firestore_id: pcDoc.id };
    
    currentPcId = id;

    document.getElementById('modalDeletePcInfo').textContent = `${pc.nom_pc} (N° ${pc.id_ordinateur})`;

    document.getElementById('deleteModal').style.display = 'block';
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    currentPcId = null;
}

async function confirmDeletePc() {
    const id = currentPcId;
    if (id === null) return;

    // 1. Récupérer l'ID du document Firestore
    const snapshot = await db.collection(STOCK_COLLECTION).where('id_ordinateur', '==', id).get();
    if (snapshot.empty) return;

    const firestore_id = snapshot.docs[0].id;
    
    // 2. Suppression dans Firestore
    await db.collection(STOCK_COLLECTION).doc(firestore_id).delete();

    // 3. Mettre à jour l'interface
    closeDeleteModal();
    renderStock();
    updateDashboard();
    document.getElementById('message').textContent = `✅ Article N° ${id} supprimé de Firestore.`;
}


// --- RENDU DU STOCK ET FILTRAGE ---

async function filterStock() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const fullStock = await getStock(); // ATTENTE des données
    
    if (!searchTerm) {
        renderStock(fullStock);
        return;
    }

    const filteredStock = fullStock.filter(pc => {
        return pc.nom_pc.toLowerCase().includes(searchTerm) || 
               pc.caracteristiques.toLowerCase().includes(searchTerm) ||
               pc.id_ordinateur.toString().includes(searchTerm);
    });

    renderStock(filteredStock);
}

// Rendu du stock: peut être appelé sans argument pour récupérer les données à jour
async function renderStock(dataToRender = null) {
    if (dataToRender === null) {
        dataToRender = await getStock(); // ATTENTE des données
    }
    
    const body = document.getElementById('inventaireBody');
    body.innerHTML = ''; 

    if (dataToRender.length === 0) {
        body.innerHTML = '<tr><td colspan="7">Aucun ordinateur trouvé.</td></tr>';
        return;
    }

    dataToRender.forEach(pc => {
        const row = body.insertRow();
        const statutClass = pc.statut.replace(/\s/g, ''); 
        
        let margeText = 'N/A';
        let margeClass = 'marge-nulle';
        const prixAchat = typeof pc.prix_achat === 'number' ? pc.prix_achat : 0;
        const prixReventeEstime = typeof pc.prix_revente_estime === 'number' ? pc.prix_revente_estime : 0;
        
        if (pc.statut === 'Vendu' && typeof pc.prix_vente_final === 'number') {
            const margeBrute = pc.prix_vente_final - prixAchat;
            margeText = formatEuro(margeBrute).replace('€', ''); 
            
            if (margeBrute > 0) {
                margeClass = 'marge-positive';
            } else if (margeBrute < 0) {
                margeClass = 'marge-negative';
            } else {
                margeClass = 'marge-nulle';
            }
        } else if (pc.statut === 'En Stock') {
            const margePotentielle = prixReventeEstime - prixAchat;
            margeText = `${formatEuro(margePotentielle).replace('€', '')} (Est.)`;
            margeClass = 'marge-estimee';
        }
        
        // Rendu HTML de la ligne
        row.innerHTML = `
            <td>${pc.id_ordinateur}</td>
            <td><strong>${pc.nom_pc}</strong></td>
            <td>${formatEuro(prixAchat)}</td>
            <td>${formatEuro(prixReventeEstime)}</td>
            <td class="${margeClass}">${margeText}</td>
            <td class="statut-${statutClass}">${pc.statut}</td>
            <td>
                ${pc.statut === 'En Stock' ? 
                    // Appel des nouvelles fonctions modales
                    `<button class="action-button btn-vendre" onclick="openSaleModal(${pc.id_ordinateur})">Vendre</button>` : 
                    `Vendu (${pc.date_vente || new Date().toLocaleDateString('fr-FR')}) <button class="action-button btn-vendre" style="font-size: 0.8em; padding: 2px 5px;" onclick="openSaleModal(${pc.id_ordinateur})">Modifier Prix</button>`
                }
                <button class="action-button btn-supprimer" onclick="openDeleteModal(${pc.id_ordinateur})">Supprimer</button>
            </td>
        `;
    });
}

// --- INITIALISATION (Mise à jour pour être asynchrone) ---
document.addEventListener('DOMContentLoaded', () => {
    renderStock();
    updateDashboard();
    
    document.getElementById('addPcForm').addEventListener('submit', addPc);
    document.getElementById('searchInput').addEventListener('input', filterStock);

    // Écouteurs de modales
    const saleModal = document.getElementById('saleModal');
    const deleteModal = document.getElementById('deleteModal');

    window.addEventListener('click', (event) => {
        if (event.target === saleModal) {
            closeSaleModal();
        } else if (event.target === deleteModal) {
            closeDeleteModal();
        }
    });
    
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (saleModal && saleModal.style.display === 'block') {
                closeSaleModal();
            } else if (deleteModal && deleteModal.style.display === 'block') {
                closeDeleteModal();
            }
        }
    });

    document.getElementById('modalSaveButton').addEventListener('click', processSale);
    document.getElementById('modalConfirmDeleteButton').addEventListener('click', confirmDeletePc);
});

// Exposer les fonctions importantes au niveau global
window.openSaleModal = openSaleModal;
window.closeSaleModal = closeSaleModal; 
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDeletePc = confirmDeletePc;
window.filterStock = filterStock;