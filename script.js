// Global variables
let inventory = [];
let locations = {};
let currentLocation = null;
let currentLocationSettings = null;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    loadData();
    updateLocationsList();
    updateLocationTabs();
    
    // Register service worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
        .then(registration => console.log('SW registered'))
        .catch(error => console.log('SW registration failed'));
}
});

// Load data from localStorage
function loadData() {
    const savedInventory = localStorage.getItem('inventory');
    const savedLocations = localStorage.getItem('locations');
    
    if (savedInventory) {
        inventory = JSON.parse(savedInventory);
    }
    
    if (savedLocations) {
        locations = JSON.parse(savedLocations);
    }
}

// Save data to localStorage
function saveData() {
    localStorage.setItem('inventory', JSON.stringify(inventory));
    localStorage.setItem('locations', JSON.stringify(locations));
}

// Show import modal
function showImportModal() {
    new bootstrap.Modal(document.getElementById('importModal')).show();
}

// Import CSV
function importCSV() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Por favor selecciona un archivo CSV');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const csv = e.target.result;
        parseCSV(csv);
        bootstrap.Modal.getInstance(document.getElementById('importModal')).hide();
        fileInput.value = '';
    };
    reader.readAsText(file);
}

// Parse CSV and consolidate duplicates
function parseCSV(csv) {
    const lines = csv.split('\n');
    const headers = lines[0].split(',');
    const newInventory = [];
    const seen = new Set();
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const values = line.split(',');
            const item = {
                storageLocation: values[0]?.trim() || '',
                item: values[1]?.trim() || '',
                uom: values[2]?.trim() || '',
                qty: parseFloat(values[3]) || 0,
                uom2: values[4]?.trim() || '',
                qty2: parseFloat(values[5]) || 0,
                uom3: values[6]?.trim() || '',
                qty3: parseFloat(values[7]) || 0
            };
            
            // Create unique key for consolidation
            const key = `${item.storageLocation}|${item.item}`;
            
            if (!seen.has(key)) {
                seen.add(key);
                newInventory.push(item);
            }
        }
    }
    
    inventory = newInventory;
    saveData();
    updateLocationsList();
    updateLocationTabs();
    
    if (Object.keys(locations).length === 0 && inventory.length > 0) {
        addNewLocation();
    }
    
    alert(`CSV importado exitosamente. ${inventory.length} productos cargados.`);
}

// Add new location
function addNewLocation() {
    const name = prompt('Nombre de la nueva ubicación:');
    if (name && !locations[name]) {
        locations[name] = {
            name: name,
            locked: false,
            order: inventory.map((item, index) => index),
            quantities: {}
        };
        
        currentLocation = name;
        saveData();
        updateLocationsList();
        updateLocationTabs();
        showLocation(name);
        
        // Close offcanvas
        const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('locationsMenu'));
        if (offcanvas) offcanvas.hide();
    } else if (locations[name]) {
        alert('Ya existe una ubicación con ese nombre');
    }
}

// Update locations list in menu
function updateLocationsList() {
    const container = document.getElementById('locationsList');
    container.innerHTML = '';
    
    Object.keys(locations).forEach(locationName => {
        const div = document.createElement('div');
        div.className = 'location-item d-flex justify-content-between align-items-center';
        div.innerHTML = `
            <span onclick="selectLocation('${locationName}')">${locationName}</span>
            <button class="btn btn-sm btn-outline-secondary" onclick="showLocationSettings('${locationName}')">
                <i class="bi bi-gear"></i>
            </button>
        `;
        container.appendChild(div);
    });
}

// Update location tabs
function updateLocationTabs() {
    const container = document.getElementById('locationTabs');
    container.innerHTML = '';
    
    Object.keys(locations).forEach(locationName => {
        const tab = document.createElement('div');
        tab.className = `location-tab ${currentLocation === locationName ? 'active' : ''}`;
        tab.innerHTML = `
            <span onclick="selectLocation('${locationName}')">${locationName}</span>
            <button class="btn btn-sm btn-link p-0 ms-2" onclick="showLocationSettings('${locationName}')">
                <i class="bi bi-gear"></i>
            </button>
        `;
        container.appendChild(tab);
    });
}

// Select location
function selectLocation(locationName) {
    currentLocation = locationName;
    updateLocationTabs();
    showLocation(locationName);
    
    // Close offcanvas
    const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('locationsMenu'));
    if (offcanvas) offcanvas.hide();
}

// Show location inventory
function showLocation(locationName) {
    const container = document.getElementById('inventoryContainer');
    const location = locations[locationName];
    
    if (!location || inventory.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="bi bi-box-seam display-1"></i>
                <h3>No hay productos disponibles</h3>
                <p>Importa un archivo CSV para comenzar.</p>
            </div>
        `;
        return;
    }
    
    // Header with location name and lock switch
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h4><i class="bi bi-geo-alt"></i> ${locationName}</h4>
            <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="lockSwitch" ${location.locked ? 'checked' : ''} onchange="toggleLock()">
                <label class="form-check-label" for="lockSwitch">
                    Bloquear orden
                </label>
            </div>
        </div>
        <div id="filter-container"></div>
        <div id="itemsList"></div>
    `;
    
    // Render the filters and the items list
    renderFilters();
    renderItems(locationName);
    
    // Initialize sortable if not locked
    if (!location.locked) {
        initSortable();
    }
}

// Function to render the filter and search bar
function renderFilters() {
    const filterContainer = document.getElementById('filter-container');
    const allStorageLocations = [...new Set(inventory.map(item => item.storageLocation))];
    allStorageLocations.sort();
    
    const filterHTML = `
        <div class="row mb-3">
            <div class="col-md-6 mb-2 mb-md-0">
                <label for="familyFilter" class="form-label">Seleccionar Familia:</label>
                <select id="familyFilter" class="form-select" onchange="filterItems()">
                    <option value="">Todas las Familias</option>
                    ${allStorageLocations.map(location => `<option value="${location}">${location}</option>`).join('')}
                </select>
            </div>
            <div class="col-md-6">
                <label for="searchFilter" class="form-label">Buscar Producto:</label>
                <div class="input-group">
                    <span class="input-group-text"><i class="bi bi-search"></i></span>
                    <input type="text" class="form-control" id="searchFilter" placeholder="Escribe para buscar..." onkeyup="filterItems()">
                </div>
            </div>
        </div>
    `;
    filterContainer.innerHTML = filterHTML;
}

// Render items for location
function renderItems(locationName) {
    const location = locations[locationName];
    const itemsList = document.getElementById('itemsList');
    itemsList.innerHTML = '';
    
    // Sort items according to saved order
    const orderedItems = location.order.map(index => inventory[index]).filter(item => item);
    
    orderedItems.forEach((item, displayIndex) => {
        const originalIndex = inventory.findIndex(invItem => 
            invItem.storageLocation === item.storageLocation && invItem.item === item.item
        );
        
        const itemDiv = document.createElement('div');
        itemDiv.className = `item-row ${location.locked ? 'locked' : ''}`;
        itemDiv.setAttribute('data-index', originalIndex);
        itemDiv.setAttribute('data-family', item.storageLocation);
        itemDiv.setAttribute('data-item', item.item.toLowerCase());
        
        // Get saved quantities for this location
        const savedQuantities = location.quantities[originalIndex] || {};
        
        itemDiv.innerHTML = `
            <div class="row align-items-center">
                <div class="col-1 text-center">
                    <i class="bi bi-grip-vertical drag-handle"></i>
                </div>
                <div class="col-md-4 col-12">
                    <strong>${item.storageLocation}</strong><br>
                    <small class="text-muted">${item.item}</small>
                </div>
                <div class="col-md-7 col-11">
                    <div class="row">
                        ${item.uom ? `
                        <div class="col-md-4 col-12 mb-2">
                            <div class="uom-label">${item.uom}</div>
                            <div class="quantity-controls">
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary" onclick="adjustQuantity(${originalIndex}, 'qty', 1)">1</button>
                                    <button class="btn btn-outline-secondary" onclick="adjustQuantity(${originalIndex}, 'qty', -1)">-1</button>
                                </div>
                                <input type="number" class="form-control form-control-sm" value="${savedQuantities.qty || 0}" 
                                       onchange="updateQuantity(${originalIndex}, 'qty', this.value)" step="0.1">
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary" onclick="adjustQuantity(${originalIndex}, 'qty', 0.1)">+0.1</button>
                                    <button class="btn btn-outline-secondary" onclick="adjustQuantity(${originalIndex}, 'qty', -0.1)">-0.1</button>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        ${item.uom2 ? `
                        <div class="col-md-4 col-12 mb-2">
                            <div class="uom-label">${item.uom2}</div>
                            <div class="quantity-controls">
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary" onclick="adjustQuantity(${originalIndex}, 'qty2', -1)">-1</button>
                                    <button class="btn btn-outline-secondary" onclick="adjustQuantity(${originalIndex}, 'qty2', -0.1)">-0.1</button>
                                </div>
                                <input type="number" class="form-control form-control-sm" value="${savedQuantities.qty2 || 0}" 
                                       onchange="updateQuantity(${originalIndex}, 'qty2', this.value)" step="0.1">
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary" onclick="adjustQuantity(${originalIndex}, 'qty2', 0.1)">+0.1</button>
                                    <button class="btn btn-outline-secondary" onclick="adjustQuantity(${originalIndex}, 'qty2', 1)">+1</button>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        ${item.uom3 ? `
                        <div class="col-md-4 col-12 mb-2">
                            <div class="uom-label">${item.uom3}</div>
                            <div class="quantity-controls">
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary" onclick="adjustQuantity(${originalIndex}, 'qty3', -1)">-1</button>
                                    <button class="btn btn-outline-secondary" onclick="adjustQuantity(${originalIndex}, 'qty3', -0.1)">-0.1</button>
                                </div>
                                <input type="number" class="form-control form-control-sm" value="${savedQuantities.qty3 || 0}" 
                                       onchange="updateQuantity(${originalIndex}, 'qty3', this.value)" step="0.1">
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary" onclick="adjustQuantity(${originalIndex}, 'qty3', 0.1)">+0.1</button>
                                    <button class="btn btn-outline-secondary" onclick="adjustQuantity(${originalIndex}, 'qty3', 1)">+1</button>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        itemsList.appendChild(itemDiv);
    });
}

// Update item order after drag and drop
function updateItemOrder() {
    const items = document.querySelectorAll('#itemsList .item-row');
    const newOrder = Array.from(items).map(item => parseInt(item.getAttribute('data-index')));
    
    if (currentLocation) {
        locations[currentLocation].order = newOrder;
        saveData();
    }
}

// Function to filter items based on selected family and search term
function filterItems() {
    const selectedFamily = document.getElementById('familyFilter').value;
    const searchTerm = document.getElementById('searchFilter').value.toLowerCase();
    
    const items = document.querySelectorAll('#itemsList .item-row');
    
    items.forEach(item => {
        const itemFamily = item.getAttribute('data-family');
        const itemName = item.getAttribute('data-item');
        
        const isFamilyMatch = selectedFamily === '' || itemFamily === selectedFamily;
        const isSearchMatch = itemName.includes(searchTerm);
        
        if (isFamilyMatch && isSearchMatch) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// Initialize sortable
function initSortable() {
    const itemsList = document.getElementById('itemsList');
    if (itemsList && !locations[currentLocation]?.locked) {
        new Sortable(itemsList, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: function(evt) {
                updateItemOrder();
            }
        });
    }
}

// Toggle lock for current location
function toggleLock() {
    const lockSwitch = document.getElementById('lockSwitch');
    if (currentLocation) {
        locations[currentLocation].locked = lockSwitch.checked;
        saveData();
        showLocation(currentLocation); // Refresh to apply lock state
    }
}

// Update quantity
function updateQuantity(itemIndex, field, value) {
    if (currentLocation) {
        if (!locations[currentLocation].quantities[itemIndex]) {
            locations[currentLocation].quantities[itemIndex] = {};
        }
        locations[currentLocation].quantities[itemIndex][field] = parseFloat(value) || 0;
        saveData();
    }
}

// Adjust quantity with buttons
function adjustQuantity(itemIndex, field, adjustment) {
    if (currentLocation) {
        if (!locations[currentLocation].quantities[itemIndex]) {
            locations[currentLocation].quantities[itemIndex] = {};
        }
        
        const currentValue = locations[currentLocation].quantities[itemIndex][field] || 0;
        const newValue = Math.max(0, currentValue + adjustment);
        locations[currentLocation].quantities[itemIndex][field] = parseFloat(newValue.toFixed(1));
        
        // Update the input field
        const input = document.querySelector(`[data-index="${itemIndex}"] input[onchange*="${field}"]`);
        if (input) {
            input.value = newValue;
        }
        
        saveData();
    }
}

// Show location settings modal
function showLocationSettings(locationName) {
    currentLocationSettings = locationName;
    const location = locations[locationName];
    
    document.getElementById('locationNameInput').value = locationName;
    document.getElementById('lockOrderSwitch').checked = location.locked;
    
    new bootstrap.Modal(document.getElementById('locationSettingsModal')).show();
}

// Save location settings
function saveLocationSettings() {
    const newName = document.getElementById('locationNameInput').value.trim();
    const locked = document.getElementById('lockOrderSwitch').checked;
    
    if (!newName) {
        alert('El nombre no puede estar vacío');
        return;
    }
    
    if (newName !== currentLocationSettings && locations[newName]) {
        alert('Ya existe una ubicación con ese nombre');
        return;
    }
    
    // Rename location if needed
    if (newName !== currentLocationSettings) {
        locations[newName] = locations[currentLocationSettings];
        delete locations[currentLocationSettings];
        
        if (currentLocation === currentLocationSettings) {
            currentLocation = newName;
        }
    }
    
    locations[newName].name = newName;
    locations[newName].locked = locked;
    
    saveData();
    updateLocationsList();
    updateLocationTabs();
    
    if (currentLocation === newName) {
        showLocation(newName);
    }
    
    bootstrap.Modal.getInstance(document.getElementById('locationSettingsModal')).hide();
}

// Delete location
function deleteLocation() {
    if (confirm(`¿Estás seguro de eliminar la ubicación "${currentLocationSettings}"?`)) {
        delete locations[currentLocationSettings];
        
        if (currentLocation === currentLocationSettings) {
            currentLocation = null;
            document.getElementById('inventoryContainer').innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-box-seam display-1"></i>
                    <h3>Selecciona una ubicación</h3>
                    <p>Elige una ubicación del menú o crea una nueva.</p>
                </div>
            `;
        }
        
        saveData();
        updateLocationsList();
        updateLocationTabs();
        bootstrap.Modal.getInstance(document.getElementById('locationSettingsModal')).hide();
    }
}

// Export location order
function exportLocationOrder() {
    if (currentLocationSettings) {
        const location = locations[currentLocationSettings];
        const orderData = {
            locationName: currentLocationSettings,
            order: location.order,
            exportDate: new Date().toISOString()
        };
        
        downloadJSON(orderData, `${currentLocationSettings}_order.json`);
    }
}

// Import location order
function importLocationOrder() {
    const fileInput = document.getElementById('orderFile');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Por favor selecciona un archivo JSON');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const orderData = JSON.parse(e.target.result);
            
            if (orderData.order && Array.isArray(orderData.order)) {
                locations[currentLocationSettings].order = orderData.order;
                saveData();
                
                if (currentLocation === currentLocationSettings) {
                    showLocation(currentLocationSettings);
                }
                
                alert('Orden importado exitosamente');
                fileInput.value = '';
            } else {
                alert('Archivo JSON inválido');
            }
        } catch (error) {
            alert('Error al leer el archivo JSON');
        }
    };
    reader.readAsText(file);
}

// Show totalization
function showTotalization() {
    document.getElementById('totalizationSection').style.display = 'block';
    document.getElementById('inventoryContainer').style.display = 'none';
    calculateTotals();
}

// Hide totalization
function hideTotalization() {
    document.getElementById('totalizationSection').style.display = 'none';
    document.getElementById('inventoryContainer').style.display = 'block';
}

// CORREGIDO: Calculate totals across all locations, grouped by StorageLocation and Item
function calculateTotals() {
    const totals = {};
    
    // Aggregate quantities from all locations
    Object.values(locations).forEach(location => {
        Object.entries(location.quantities).forEach(([itemIndex, quantities]) => {
            const item = inventory[itemIndex];
            if (!item) return;
            
            // CORREGIDO: Use StorageLocation + Item as the unique key
            const key = `${item.storageLocation}|${item.item}`;
            
            if (!totals[key]) {
                totals[key] = {
                    storageLocation: item.storageLocation,
                    item: item.item,
                    uom: item.uom,
                    qty: 0,
                    uom2: item.uom2,
                    qty2: 0,
                    uom3: item.uom3,
                    qty3: 0
                };
            }
            
            totals[key].qty += quantities.qty || 0;
            totals[key].qty2 += quantities.qty2 || 0;
            totals[key].qty3 += quantities.qty3 || 0;
        });
    });
    
    // Filter items with quantities > 0
    const filteredTotals = Object.values(totals).filter(item => 
        item.qty > 0 || item.qty2 > 0 || item.qty3 > 0
    );
    
    renderTotals(filteredTotals);
}

// Render totals
function renderTotals(totals) {
    const container = document.getElementById('totalsContainer');
    container.innerHTML = '';
    
    if (totals.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="bi bi-inbox display-1"></i>
                <h4>No hay productos con cantidades</h4>
                <p>Carga cantidades en las ubicaciones para ver la totalización.</p>
            </div>
        `;
        return;
    }
    
    // Group by storage location
    const grouped = {};
    totals.forEach(item => {
        if (!grouped[item.storageLocation]) {
            grouped[item.storageLocation] = [];
        }
        grouped[item.storageLocation].push(item);
    });
    
    // Render grouped totals
    Object.entries(grouped).forEach(([storageLocation, items]) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'mb-4';
        groupDiv.innerHTML = `
            <h5 class="text-primary border-bottom pb-2">
                <i class="bi bi-folder"></i> ${storageLocation}
            </h5>
        `;
        
        items.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'total-item';
            itemDiv.innerHTML = `
                <div class="row">
                    <div class="col-md-6 col-12">
                        <strong>${item.item}</strong>
                    </div>
                    <div class="col-md-6 col-12">
                        <div class="row">
                            ${item.qty > 0 ? `
                            <div class="col-4">
                                <small class="text-muted">${item.uom}</small><br>
                                <span class="badge bg-primary">${item.qty}</span>
                            </div>
                            ` : ''}
                            ${item.qty2 > 0 ? `
                            <div class="col-4">
                                <small class="text-muted">${item.uom2}</small><br>
                                <span class="badge bg-success">${item.qty2}</span>
                            </div>
                            ` : ''}
                            ${item.qty3 > 0 ? `
                            <div class="col-4">
                                <small class="text-muted">${item.uom3}</small><br>
                                <span class="badge bg-info">${item.qty3}</span>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
            groupDiv.appendChild(itemDiv);
        });
        
        container.appendChild(groupDiv);
    });
}

// Filter totals based on search
function filterTotals() {
    const searchTerm = document.getElementById('searchTotals').value.toLowerCase();
    const totalItems = document.querySelectorAll('.total-item');
    
    totalItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(searchTerm) ? 'block' : 'none';
    });
}

// CORREGIDO: Export totals to CSV, grouped by StorageLocation and Item
function exportTotals() {
    const totals = {};
    
    // Aggregate quantities from all locations
    Object.values(locations).forEach(location => {
        Object.entries(location.quantities).forEach(([itemIndex, quantities]) => {
            const item = inventory[itemIndex];
            if (!item) return;
            
            // CORREGIDO: Use StorageLocation + Item as the unique key
            const key = `${item.storageLocation}|${item.item}`;
            
            if (!totals[key]) {
                totals[key] = {
                    storageLocation: item.storageLocation,
                    item: item.item,
                    uom: item.uom,
                    qty: 0,
                    uom2: item.uom2,
                    qty2: 0,
                    uom3: item.uom3,
                    qty3: 0
                };
            }
            
            totals[key].qty += quantities.qty || 0;
            totals[key].qty2 += quantities.qty2 || 0;
            totals[key].qty3 += quantities.qty3 || 0;
        });
    });
    
    // Filter items with quantities > 0
    const filteredTotals = Object.values(totals).filter(item => 
        item.qty > 0 || item.qty2 > 0 || item.qty3 > 0
    );
    
    if (filteredTotals.length === 0) {
        alert('No hay datos para exportar');
        return;
    }
    
    // Generate CSV
    const headers = ['StorageLocation', 'Item', 'UofM', 'Qty', 'UofM2', 'Qty2', 'UofM3', 'Qty3'];
    let csv = headers.join(',') + '\n';
    
    filteredTotals.forEach(item => {
        const row = [
            item.storageLocation,
            item.item,
            item.uom || '',
            item.qty || 0,
            item.uom2 || '',
            item.qty2 || 0,
            item.uom3 || '',
            item.qty3 || 0
        ].map(field => `"${field}"`).join(',');
        csv += row + '\n';
    });
    
    downloadCSV(csv, `inventario_total_${new Date().toISOString().split('T')[0]}.csv`);
}

// Download CSV
function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// Download JSON
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// PWA Install prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Show install button or notification
    const installButton = document.createElement('button');
    installButton.className = 'btn btn-success position-fixed bottom-0 end-0 m-3';
    installButton.innerHTML = '<i class="bi bi-download"></i> Instalar App';
    installButton.onclick = () => {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            }
            deferredPrompt = null;
            installButton.remove();
        });
    };
    
    document.body.appendChild(installButton);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (installButton.parentNode) {
            installButton.remove();
        }
    }, 10000);
});