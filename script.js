// Global variables
let inventory = [];
let locations = {};
let currentLocation = null;
let currentLocationSettings = null;
let selectedItems = new Set();
let isSelectionMode = false;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    loadData();
    updateLocationsList();
    updateLocationTabs();
    createScrollToTopButton();
    preventMobileDoubleZoom();
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator && window.location.protocol !== 'file:'){
        navigator.serviceWorker.register('/InventarioAPP/service-worker.js')
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
                qty: 0,
                uom2: values[4]?.trim() || '',
                qty2: 0,
                uom3: values[6]?.trim() || '',
                qty3: 0
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
    
    // Clear selection when changing location
    clearSelection();
    
    // Header with location name and lock switch
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h4><i class="bi bi-geo-alt"></i> ${locationName}</h4>
            <div class="d-flex align-items-center gap-3">
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="lockSwitch" ${location.locked ? 'checked' : ''} onchange="toggleLock()">
                    <label class="form-check-label" for="lockSwitch">
                        Bloquear orden
                    </label>
                </div>
                ${!location.locked ? `
                <div class="selection-controls" style="display: none;">
                    <button class="btn btn-sm btn-outline-primary me-2" onclick="selectAllItems()">
                        <i class="bi bi-check-all"></i> Todos
                    </button>
                    <button class="btn btn-sm btn-outline-secondary me-2" onclick="clearSelection()">
                        <i class="bi bi-x-circle"></i> Limpiar
                    </button>
                    <span class="badge bg-info" id="selectionCounter">0 seleccionados</span>
                </div>
                ` : ''}
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

// NUEVA: Función para prevenir el doble zoom en móviles
function preventMobileDoubleZoom() {
    let lastTouchEnd = 0;
    
    document.addEventListener('touchend', function (event) {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });
}

// FUNCIÓN CORREGIDA: Redondear números para evitar problemas de precisión
function roundToDecimals(num, decimals = 2) {
    return Math.round((num + Number.EPSILON) * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// NUEVA: Función para evaluar expresiones matemáticas de forma segura
function evaluateMathExpression(expression) {
    try {
        // Limpiar la expresión: solo permitir números, operadores básicos y puntos decimales
        const cleanExpression = expression.replace(/[^0-9+\-*/().\s]/g, '');
        
        // Verificar que la expresión no esté vacía después de limpiar
        if (!cleanExpression.trim()) {
            return NaN;
        }
        
        // Evaluar usando Function constructor (más seguro que eval)
        const result = new Function('return ' + cleanExpression)();
        
        // Verificar que el resultado sea un número válido
        if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
            return result;
        } else {
            return NaN;
        }
    } catch (error) {
        return NaN;
    }
}

function showMathError(itemIndex, field) {
    const input = document.querySelector(`[data-index="${itemIndex}"] input[onchange*="${field}"]`);
    if (input) {
        // Guardar el color original
        const originalBorder = input.style.border;
        
        // Cambiar a color de error
        input.style.border = '2px solid #dc3545';
        input.style.boxShadow = '0 0 5px rgba(220, 53, 69, 0.3)';
        
        // Crear tooltip de error
        const tooltip = document.createElement('div');
        tooltip.className = 'math-error-tooltip';
        tooltip.innerHTML = '<small>Operación inválida</small>';
        tooltip.style.cssText = `
            position: absolute;
            background: #dc3545;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            z-index: 1000;
            margin-top: -25px;
            margin-left: 5px;
        `;
        
        input.parentElement.style.position = 'relative';
        input.parentElement.appendChild(tooltip);
        
        // Restaurar después de 2 segundos
        setTimeout(() => {
            input.style.border = originalBorder;
            input.style.boxShadow = '';
            if (tooltip.parentElement) {
                tooltip.parentElement.removeChild(tooltip);
            }
        }, 2000);
    }
}

// NUEVA: Manejar tecla Enter para ejecutar operaciones matemáticas inmediatamente
function handleMathKeypress(event, itemIndex, field) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const input = event.target;
        updateQuantity(itemIndex, field, input.value);
    }
}

// Render items for location
function renderItems(locationName) {
    const location = locations[locationName];
    const itemsList = document.getElementById('itemsList');
    itemsList.innerHTML = '';
    
    // Destruir sortable existente
    if (itemsList.sortableInstance) {
        itemsList.sortableInstance.destroy();
        itemsList.sortableInstance = null;
    }
    
    // Sort items according to saved order
    const orderedItems = location.order.map(index => inventory[index]).filter(item => item);
    
    orderedItems.forEach((item, displayIndex) => {
        const originalIndex = inventory.findIndex(invItem => 
            invItem.storageLocation === item.storageLocation && invItem.item === item.item
        );
        
        const itemDiv = document.createElement('div');
        itemDiv.className = `item-row ${location.locked ? 'locked' : ''} ${selectedItems.has(originalIndex) ? 'selected' : ''}`;
        itemDiv.setAttribute('data-index', originalIndex);
        itemDiv.setAttribute('data-family', item.storageLocation);
        itemDiv.setAttribute('data-item', item.item.toLowerCase());
        
        // Eventos mejorados para selección múltiple
        if (!location.locked) {
            // Evento de click para selección
            itemDiv.addEventListener('click', function(e) {
                // Prevenir selección si se clickeó en elementos interactivos
                if (e.target.closest('input, button, .btn')) {
                    return;
                }
                
                e.preventDefault();
                e.stopPropagation();
                toggleItemSelection(originalIndex, itemDiv);
            });
            
            // Prevenir interferencia con drag en elementos interactivos
            itemDiv.addEventListener('mousedown', function(e) {
                if (e.target.closest('input, button, .btn')) {
                    e.stopPropagation();
                }
            });
            
            // Eventos táctiles para dispositivos móviles
            itemDiv.addEventListener('touchstart', function(e) {
                if (e.target.closest('input, button, .btn')) {
                    e.stopPropagation();
                }
            });
        }
        
        // Mostrar datos del CSV si no hay cantidades guardadas
        const savedQuantities = location.quantities[originalIndex] || {};
        const displayQty = savedQuantities.qty !== undefined ? savedQuantities.qty : 0;
        const displayQty2 = savedQuantities.qty2 !== undefined ? savedQuantities.qty2 : 0;
        const displayQty3 = savedQuantities.qty3 !== undefined ? savedQuantities.qty3 : 0;
        
        itemDiv.innerHTML = `
            <div class="row align-items-center">
                <div class="col-1 text-center">
                    <i class="bi bi-grip-vertical drag-handle" 
                       style="cursor: ${location.locked ? 'not-allowed' : 'grab'}; user-select: none; font-size: 16px; padding: 5px;"></i>
                </div>
                <div class="col-md-4 col-12">
                    <strong>${item.item}</strong><br>
                    <small class="text-muted">${item.storageLocation}</small>
                </div>
                <div class="col-md-7 col-11">
                    <div class="row">
                        ${item.uom ? `
                        <div class="col-md-4 col-12 mb-2">
                            <div class="uom-label">${item.uom}</div>
                            <div class="quantity-controls">
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty', +1)">+1</button>
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty', -1)">-1</button>
                                </div>
                                <input type="text" class="form-control form-control-sm math-input" value="${displayQty}" 
                                       onchange="event.stopPropagation(); updateQuantity(${originalIndex}, 'qty', this.value)" 
                                       onkeypress="handleMathKeypress(event, ${originalIndex}, 'qty')"
                                       onclick="event.stopPropagation();"
                                       placeholder="ej: 5+3, 10-2" step="0.1">
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty', +0.1)">+0.1</button>
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty', -0.1)">-0.1</button>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        ${item.uom2 ? `
                        <div class="col-md-4 col-12 mb-2">
                            <div class="uom-label">${item.uom2}</div>
                            <div class="quantity-controls">
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty2', +1)">+1</button>
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty2', -1)">-1</button>
                                </div>
                                <input type="text" class="form-control form-control-sm math-input" value="${displayQty2}" 
                                       onchange="event.stopPropagation(); updateQuantity(${originalIndex}, 'qty2', this.value)" 
                                       onkeypress="handleMathKeypress(event, ${originalIndex}, 'qty2')"
                                       onclick="event.stopPropagation();"
                                       placeholder="ej: 8*2, 20/4" step="0.1">
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty2', +0.1)">+0.1</button>
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty2', -0.1)">-0.1</button>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        ${item.uom3 ? `
                        <div class="col-md-4 col-12 mb-2">
                            <div class="uom-label">${item.uom3}</div>
                            <div class="quantity-controls">
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty3', +1)">+1</button>
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty3', -1)">-1</button>
                                </div>
                                <input type="text" class="form-control form-control-sm math-input" value="${displayQty3}" 
                                       onchange="event.stopPropagation(); updateQuantity(${originalIndex}, 'qty3', this.value)" 
                                       onkeypress="handleMathKeypress(event, ${originalIndex}, 'qty3')"
                                       onclick="event.stopPropagation();"
                                       placeholder="ej: 15+5, 12-4" step="0.1">
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty3', +0.1)">+0.1</button>
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty3', -0.1)">-0.1</button>
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
    
    // Inicializar sortable después de renderizar todos los items
    if (!location.locked) {
        setTimeout(() => {
            initSortable();
        }, 100);
    }
}

// Update item order after drag and drop
function updateItemOrder() {
    const items = document.querySelectorAll('#itemsList .item-row');
    const newOrder = Array.from(items).map(item => parseInt(item.getAttribute('data-index')));
    
    if (currentLocation) {
        locations[currentLocation].order = newOrder;
        saveData();
        
        // Actualizar índices de elementos seleccionados si es necesario
        const updatedSelectedItems = new Set();
        selectedItems.forEach(oldIndex => {
            const newPosition = newOrder.indexOf(oldIndex);
            if (newPosition !== -1) {
                updatedSelectedItems.add(oldIndex);
            }
        });
        selectedItems = updatedSelectedItems;
        updateSelectionUI();
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

// NUEVA: Función para alternar selección de items
function toggleItemSelection(itemIndex, itemElement) {
    if (selectedItems.has(itemIndex)) {
        selectedItems.delete(itemIndex);
        itemElement.classList.remove('selected');
        console.log(`Item ${itemIndex} deseleccionado`);
    } else {
        selectedItems.add(itemIndex);
        itemElement.classList.add('selected');
        console.log(`Item ${itemIndex} seleccionado`);
    }
    
    updateSelectionUI();
    console.log('Items actualmente seleccionados:', Array.from(selectedItems));
}



// NUEVA: Actualizar interfaz de selección
function updateSelectionUI() {
    const selectionControls = document.querySelector('.selection-controls');
    const selectionCounter = document.getElementById('selectionCounter');
    
    if (selectedItems.size > 0) {
        if (selectionControls) {
            selectionControls.style.display = 'flex';
            isSelectionMode = true;
        }
        if (selectionCounter) {
            selectionCounter.textContent = `${selectedItems.size} seleccionados`;
        }
    } else {
        if (selectionControls) {
            selectionControls.style.display = 'none';
            isSelectionMode = false;
        }
    }
}

// NUEVA: Seleccionar todos los items visibles
function selectAllItems() {
    const visibleItems = document.querySelectorAll('#itemsList .item-row:not([style*="display: none"])');
    
    visibleItems.forEach(itemElement => {
        const itemIndex = parseInt(itemElement.getAttribute('data-index'));
        selectedItems.add(itemIndex);
        itemElement.classList.add('selected');
    });
    
    updateSelectionUI();
    console.log(`${selectedItems.size} items seleccionados`);
}

// NUEVA: Limpiar selección
function clearSelection() {
    selectedItems.clear();
    
    const selectedElements = document.querySelectorAll('#itemsList .item-row.selected');
    selectedElements.forEach(element => {
        element.classList.remove('selected');
    });
    
    updateSelectionUI();
    console.log('Selección limpiada');
}

// Initialize sortable con soporte para selección múltiple
function initSortable() {
    const itemsList = document.getElementById('itemsList');
    if (itemsList && !locations[currentLocation]?.locked) {
        // Destruir sortable existente
        if (itemsList.sortableInstance) {
            itemsList.sortableInstance.destroy();
        }
        
        itemsList.sortableInstance = new Sortable(itemsList, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            
            // Configuración básica de drag
            handle: '.drag-handle',
            filter: '.locked, input, button, .btn',
            preventOnFilter: false,
            
            // Configuración para dispositivos móviles
            delay: 100,
            delayOnTouchOnly: true,
            touchStartThreshold: 5,
            fallbackTolerance: 10,
            
            onStart: function(evt) {
                console.log('Iniciando drag');
                
                const draggedIndex = parseInt(evt.item.getAttribute('data-index'));
                
                // Si el elemento arrastrado no está seleccionado, limpiar selección previa y seleccionarlo
                if (!selectedItems.has(draggedIndex)) {
                    clearSelection();
                    toggleItemSelection(draggedIndex, evt.item);
                }
                
                // Marcar todos los items seleccionados visualmente
                selectedItems.forEach(index => {
                    const element = document.querySelector(`[data-index="${index}"]`);
                    if (element) {
                        element.classList.add('sortable-chosen');
                        element.style.opacity = '0.7';
                    }
                });
                
                console.log('Items siendo arrastrados:', Array.from(selectedItems));
            },
            
            onEnd: function(evt) {
                console.log('Finalizando drag');
                
                // Limpiar estilos visuales
                document.querySelectorAll('.sortable-chosen, .sortable-drag').forEach(el => {
                    el.classList.remove('sortable-chosen', 'sortable-drag');
                    el.style.opacity = '';
                });
                
                // Si hay múltiples items seleccionados, moverlos todos juntos
                if (selectedItems.size > 1) {
                    moveMultipleItems(evt);
                } else {
                    // Movimiento simple
                    updateItemOrder();
                }
                
                // Mantener la selección después del drag
                setTimeout(() => {
                    selectedItems.forEach(index => {
                        const element = document.querySelector(`[data-index="${index}"]`);
                        if (element) {
                            element.classList.add('selected');
                        }
                    });
                    updateSelectionUI();
                }, 100);
            }
        });
        
        console.log('Sortable inicializado');
    }
}

// Toggle lock for current location
function toggleLock() {
    const lockSwitch = document.getElementById('lockSwitch');
    if (currentLocation) {
        locations[currentLocation].locked = lockSwitch.checked;
        
        // Limpiar selección cuando se bloquea
        if (lockSwitch.checked) {
            clearSelection();
        }
        
        saveData();
        showLocation(currentLocation); // Refresh to apply lock state
    }
}

// CORREGIDA: Update quantity con redondeo y soporte para operaciones matemáticas
function updateQuantity(itemIndex, field, value) {
    if (currentLocation) {
        if (!locations[currentLocation].quantities[itemIndex]) {
            locations[currentLocation].quantities[itemIndex] = {};
        }
        
        let finalValue;
        
        // Si el valor contiene operadores matemáticos, intentar evaluarlo
        if (typeof value === 'string' && /[+\-*/]/.test(value)) {
            const calculatedValue = evaluateMathExpression(value);
            
            if (!isNaN(calculatedValue)) {
                finalValue = Math.max(0, calculatedValue); // No permitir valores negativos
            } else {
                // Si la evaluación falla, mantener el valor anterior o usar 0
                finalValue = locations[currentLocation].quantities[itemIndex][field] || 0;
                
                // Mostrar mensaje de error brevemente
                showMathError(itemIndex, field);
                return;
            }
        } else {
            finalValue = Math.max(0, parseFloat(value) || 0);
        }
        
        const roundedValue = roundToDecimals(finalValue, 2); // CAMBIO AQUÍ: de 1 a 2
        locations[currentLocation].quantities[itemIndex][field] = roundedValue;
        
        // Actualizar el input con el resultado calculado
        const input = document.querySelector(`[data-index="${itemIndex}"] input[onchange*="${field}"]`);
        if (input) {
            input.value = roundedValue;
        }
        
        saveData();
    }
}

// CORREGIDA: Adjust quantity with buttons con redondeo
function adjustQuantity(itemIndex, field, adjustment) {
    if (currentLocation) {
        if (!locations[currentLocation].quantities[itemIndex]) {
            locations[currentLocation].quantities[itemIndex] = {};
        }
        
        const currentValue = locations[currentLocation].quantities[itemIndex][field] || 0;
        const newValue = Math.max(0, currentValue + adjustment);
        const roundedValue = roundToDecimals(newValue, 2); // CAMBIO AQUÍ: de 1 a 2
        locations[currentLocation].quantities[itemIndex][field] = roundedValue;
        
        // Update the input field
        const input = document.querySelector(`[data-index="${itemIndex}"] input[onchange*="${field}"]`);
        if (input) {
            input.value = roundedValue;
        }
        
        saveData();
    }
}

// NUEVA: Crear botón flotante para scroll to top
function createScrollToTopButton() {
    const scrollButton = document.createElement('button');
    scrollButton.id = 'scrollToTopBtn';
    scrollButton.className = 'btn btn-primary position-fixed';
    scrollButton.innerHTML = '<i class="bi bi-arrow-up"></i>';
    scrollButton.style.cssText = `
        bottom: 20px;
        right: 20px;
        z-index: 1050;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        display: none;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        touch-action: manipulation;
    `;
    
    scrollButton.onclick = function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };
    
    document.body.appendChild(scrollButton);
    
    // Show/hide button based on scroll position
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            scrollButton.style.display = 'block';
        } else {
            scrollButton.style.display = 'none';
        }
    });
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

// Calculate totals across all locations, grouped by StorageLocation and Item
function calculateTotals() {
    const totals = {};
    
    // Aggregate quantities from all locations
    Object.values(locations).forEach(location => {
        Object.entries(location.quantities).forEach(([itemIndex, quantities]) => {
            const item = inventory[itemIndex];
            if (!item) return;
            
            // Use StorageLocation + Item as the unique key
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

// Export totals to CSV, grouped by StorageLocation and Item
function exportTotals() {
    const totals = {};
    
    // Aggregate quantities from all locations
    Object.values(locations).forEach(location => {
        Object.entries(location.quantities).forEach(([itemIndex, quantities]) => {
            const item = inventory[itemIndex];
            if (!item) return;
            
            // Use StorageLocation + Item as the unique key
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

// Nueva función para exportar todas las ubicaciones
function exportAllLocations() {
    const allData = [];
    
    // Obtener los datos del inventario original para obtener UofM
    const itemsData = {};
    inventory.forEach(item => {
        const key = `${item.storageLocation}|${item.item}`;
        itemsData[key] = {
            uom: item.uom,
            uom2: item.uom2,
            uom3: item.uom3
        };
    });
    
    // Recorrer cada ubicación para obtener los datos de cada item
    Object.values(locations).forEach(location => {
        Object.entries(location.quantities).forEach(([itemIndex, quantities]) => {
            const item = inventory[itemIndex];
            if (!item) return;
            
            // Si el item tiene alguna cantidad, agregarlo a los datos
            if (quantities.qty > 0 || quantities.qty2 > 0 || quantities.qty3 > 0) {
                allData.push({
                    storageLocation: location.name, // Nuevo campo de la ubicación
                    item: item.item,
                    uom: item.uom,
                    qty: roundToDecimals(quantities.qty || 0, 2), // CAMBIO AQUÍ: de 1 a 2
                    uom2: item.uom2,
                    qty2: roundToDecimals(quantities.qty2 || 0, 2), // CAMBIO AQUÍ: de 1 a 2
                    uom3: item.uom3,
                    qty3: roundToDecimals(quantities.qty3 || 0, 2) // CAMBIO AQUÍ: de 1 a 2
                });
            }
        });
    });
    
    if (allData.length === 0) {
        alert('No hay datos para exportar de las ubicaciones.');
        return;
    }
    
    // Generar el CSV
    const headers = ['StorageLocation', 'Item', 'UofM', 'Qty', 'UofM2', 'Qty2', 'UofM3', 'Qty3'];
    let csv = headers.join(',') + '\n';
    
    allData.forEach(row => {
        const line = [
            row.storageLocation,
            row.item,
            row.uom || '',
            row.qty || 0,
            row.uom2 || '',
            row.qty2 || 0,
            row.uom3 || '',
            row.qty3 || 0
        ].map(field => `"${field}"`).join(',');
        csv += line + '\n';
    });
    
    downloadCSV(csv, `inventario_ubicaciones_${new Date().toISOString().split('T')[0]}.csv`);
}

// Nueva función para limpiar las cantidades de la ubicación actual
function clearLocationQuantities() {
    if (confirm(`¿Estás seguro de que quieres limpiar todas las cantidades de la ubicación "${currentLocationSettings}"? Esta acción no se puede deshacer.`)) {
        if (currentLocationSettings && locations[currentLocationSettings]) {
            locations[currentLocationSettings].quantities = {};
            saveData();
            
            if (currentLocation === currentLocationSettings) {
                showLocation(currentLocationSettings); // Refresca la vista
            }
            
            alert('Cantidades de ubicación limpiadas exitosamente.');
            bootstrap.Modal.getInstance(document.getElementById('locationSettingsModal')).hide();
        }
    }
}


function moveMultipleItems(evt) {
    const fromIndex = evt.oldIndex;
    const toIndex = evt.newIndex;
    
    if (fromIndex === toIndex) {
        return;
    }
    
    const currentOrder = [...locations[currentLocation].order];
    const selectedIndices = Array.from(selectedItems).sort((a, b) => {
        const posA = currentOrder.indexOf(a);
        const posB = currentOrder.indexOf(b);
        return posA - posB;
    });
    
    // Remover items seleccionados del orden actual
    const itemsToMove = [];
    selectedIndices.reverse().forEach(index => {
        const position = currentOrder.indexOf(index);
        if (position !== -1) {
            itemsToMove.unshift(currentOrder.splice(position, 1)[0]);
        }
    });
    
    // Calcular nueva posición ajustada
    let insertPosition = toIndex;
    
    // Ajustar posición basada en items removidos antes de la posición objetivo
    selectedIndices.forEach(index => {
        const originalPos = locations[currentLocation].order.indexOf(index);
        if (originalPos < evt.oldIndex) {
            insertPosition--;
        }
    });
    
    // Insertar items en la nueva posición
    currentOrder.splice(insertPosition, 0, ...itemsToMove);
    
    // Actualizar orden en la ubicación
    locations[currentLocation].order = currentOrder;
    saveData();
    
    // Re-renderizar la vista
    renderItems(currentLocation);
    
    console.log('Múltiples items movidos a posición:', insertPosition);
}