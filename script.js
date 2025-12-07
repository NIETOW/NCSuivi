const STORAGE_KEY = 'parc_informatique_stock';

// Variable globale pour stocker l'ID du PC en cours de vente/suppression
let currentPcId = null;

// --- Fonctions de base (Identiques - et corrigées de la typo précédente !) ---
function getStock() {
    const stockJson = localStorage.getItem(STORAGE_KEY); 
    return stockJson ? JSON.parse(stockJson) : [];
}

function saveStock(stock) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stock));
}

function getNextId(stock) {
    const maxId = stock.reduce((max, pc) => pc.id_ordinateur > max ? pc.id_ordinateur : max, 0);
    return Math.max(1000, maxId) + 1;
}

const formatEuro = (value) => value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

// --- MISE À JOUR DU TABLEAU DE BORD (Identique) ---
function updateDashboard() {
    const stock = getStock();
    
    let soldCount = 0;
    let stockCount = 0;
    let totalExpenses = 0;
    let totalRevenue = 0; 
    let totalProfit = 0; 

    stock.forEach(pc => {
        if (pc.statut === 'En Stock') {
            stockCount++;
        } else if (pc.statut === 'Vendu') {
            soldCount++;
        }
        
        totalExpenses += (typeof pc.prix_achat === 'number' ? pc.prix_achat : 0);

        if (pc.statut === 'Vendu' && typeof pc.prix_vente_final === 'number') {
            totalRevenue += pc.prix_vente_final; 
            
            const margeReelle = pc.prix_vente_final - pc.prix_achat;
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


// --- AJOUT DE PC (Identique) ---
function addPc(event) {
    event.preventDefault();
    
    const nomPc = document.getElementById('nomPc').value.trim();
    const caracteristiques = document.getElementById('caracteristiques').value.trim();
    const prixAchat = parseFloat(document.getElementById('prixAchat').value);
    const prixRevente = parseFloat(document.getElementById('prixRevente').value);
    
    if (!nomPc || !caracteristiques || isNaN(prixAchat) || prixAchat <= 0 || isNaN(prixRevente) || prixRevente <= 0) {
        document.getElementById('message').textContent = "❌ Erreur: Veuillez remplir tous les champs correctement avec des prix valides.";
        return;
    }

    const fullStock = getStock();
    const nextId = getNextId(fullStock); 

    const newPc = {
        id_ordinateur: nextId,
        nom_pc: nomPc,
        caracteristiques: caracteristiques,
        prix_achat: prixAchat,
        prix_revente_estime: prixRevente,
        statut: 'En Stock'
    };

    fullStock.push(newPc);
    saveStock(fullStock);
    
    document.getElementById('addPcForm').reset();
    renderStock(fullStock);
    updateDashboard(); 
    document.getElementById('message').textContent = `✅ PC ajouté ! N° Inventaire: ${nextId}`;
}


// --- GESTION DE LA MODALE DE VENTE (Identique) ---

function openSaleModal(id) {
    const stock = getStock();
    const pc = stock.find(pc => pc.id_ordinateur === id);
    
    if (!pc) return;
    
    currentPcId = id;

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

function closeSaleModal() {
    document.getElementById('saleModal').style.display = 'none';
    currentPcId = null;
}

function processSale() {
    const id = currentPcId;
    if (id === null) return;

    const finalSalePriceInput = document.getElementById('finalSalePrice');
    const finalPrice = parseFloat(finalSalePriceInput.value);
    const modalMessage = document.getElementById('modalMessage');

    if (isNaN(finalPrice) || finalPrice <= 0) {
        modalMessage.textContent = "❌ Erreur: Veuillez entrer un prix de vente valide et positif.";
        return;
    }

    let stock = getStock();
    const pcIndex = stock.findIndex(pc => pc.id_ordinateur === id);

    if (pcIndex === -1) return;

    stock[pcIndex].statut = 'Vendu';
    stock[pcIndex].prix_vente_final = finalPrice;
    stock[pcIndex].date_vente = new Date().toLocaleDateString('fr-FR');
    
    saveStock(stock);
    renderStock(stock);
    updateDashboard();
    
    modalMessage.textContent = `✅ Vente de ${stock[pcIndex].nom_pc} enregistrée !`;
    
    setTimeout(closeSaleModal, 1000); 
}


// --- NOUVELLE GESTION DE LA MODALE DE SUPPRESSION ---

// 1. Ouvre la modale et prépare l'ID
function openDeleteModal(id) {
    const stock = getStock();
    const pc = stock.find(pc => pc.id_ordinateur === id);
    
    if (!pc) return;
    
    currentPcId = id;

    document.getElementById('modalDeletePcInfo').textContent = `${pc.nom_pc} (N° ${pc.id_ordinateur})`;

    document.getElementById('deleteModal').style.display = 'block';
}

// 2. Ferme la modale de suppression
function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    currentPcId = null;
}

// 3. Exécute la suppression
function confirmDeletePc() {
    const id = currentPcId;
    if (id === null) return;

    let stock = getStock();
    stock = stock.filter(pc => pc.id_ordinateur !== id);
    saveStock(stock);
    
    // Après suppression, on ferme la modale et met à jour l'interface
    closeDeleteModal();
    renderStock(stock);
    updateDashboard();
    // On peut ajouter un message de confirmation au tableau de bord si besoin
    document.getElementById('message').textContent = `✅ Article N° ${id} supprimé.`;
}


// --- FILTRAGE (Identique) ---
function filterStock() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const fullStock = getStock();
    
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

// --- RENDU DU STOCK (Mise à jour des appels aux actions) ---
function renderStock(dataToRender = getStock()) {
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
        
        // ATTENTION : Le bouton Supprimer appelle maintenant openDeleteModal
        row.innerHTML = `
            <td>${pc.id_ordinateur}</td>
            <td><strong>${pc.nom_pc}</strong></td>
            <td>${formatEuro(prixAchat)}</td>
            <td>${formatEuro(prixReventeEstime)}</td>
            <td class="${margeClass}">${margeText}</td>
            <td class="statut-${statutClass}">${pc.statut}</td>
            <td>
                ${pc.statut === 'En Stock' ? 
                    `<button class="action-button btn-vendre" onclick="openSaleModal(${pc.id_ordinateur})">Vendre</button>` : 
                    `Vendu (${pc.date_vente || new Date().toLocaleDateString('fr-FR')}) <button class="action-button btn-modifier-prix" style="font-size: 0.8em; padding: 2px 5px;" onclick="openSaleModal(${pc.id_ordinateur})">Modifier Prix</button>`
                }
                <button class="action-button btn-supprimer" onclick="openDeleteModal(${pc.id_ordinateur})">Supprimer</button>
            </td>
        `;
    });
}

// --- INITIALISATION (Ajout des écouteurs de la modale) ---
document.addEventListener('DOMContentLoaded', () => {
    renderStock();
    updateDashboard();
    document.getElementById('addPcForm').addEventListener('submit', addPc);
    document.getElementById('searchInput').addEventListener('input', filterStock);

    // Gestion commune des modales (vente et suppression)
    const saleModal = document.getElementById('saleModal');
    const deleteModal = document.getElementById('deleteModal');

    // Fermer les modales en cliquant sur le fond (extérieur)
    window.addEventListener('click', (event) => {
        if (event.target === saleModal) {
            closeSaleModal();
        } else if (event.target === deleteModal) {
            closeDeleteModal();
        }
    });
    
    // Fermer les modales avec la touche Echap
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (saleModal.style.display === 'block') {
                closeSaleModal();
            } else if (deleteModal.style.display === 'block') {
                closeDeleteModal();
            }
        }
    });

    // Écouteurs pour la modale de Vente
    document.getElementById('modalSaveButton').addEventListener('click', processSale);

    // Écouteur pour la modale de Suppression (Bouton de confirmation)
    document.getElementById('modalConfirmDeleteButton').addEventListener('click', confirmDeletePc);
});

// Exposer les fonctions importantes au niveau global
window.openSaleModal = openSaleModal;
window.closeSaleModal = closeSaleModal; 
window.openDeleteModal = openDeleteModal; // Nouvelle fonction exposée
window.closeDeleteModal = closeDeleteModal; // Nouvelle fonction exposée
window.confirmDeletePc = confirmDeletePc; // Nouvelle fonction exposée
window.filterStock = filterStock;