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
    
    // Aplicar correcciones específicas para Android
    initTouchEventsForAndroid();
    handleTouchEvents();
    
    // Verificar que SortableJS se cargó correctamente
    if (typeof Sortable === 'undefined') {
        console.error('SortableJS no se cargó correctamente');
        alert('Error: SortableJS no se pudo cargar. Verifica tu conexión a internet.');
    } else {
        console.log('SortableJS cargado correctamente');
    }
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator && window.location.protocol !== 'file:'){
        navigator.serviceWorker.register('/InventarioAPP/service-worker.js')
            .then(registration => console.log('SW registered'))
            .catch(error => console.log('SW registration failed'));
    }
});

// FUNCIÓN CORREGIDA: Manejar eventos de toque para Android Samsung
function handleTouchEvents() {
    let lastTouchEnd = 0;
    
    document.addEventListener('touchend', function (event) {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });
    
    // Evitar zoom por pinch solo cuando sea necesario
    document.addEventListener('touchstart', function(event) {
        if (event.touches.length > 1) {
            event.preventDefault();
        }
    }, { passive: false });
}

// FUNCIÓN CORREGIDA: Inicializar eventos táctiles para Android Samsung
function initTouchEventsForAndroid() {
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isSamsung = /Samsung/i.test(navigator.userAgent) || /SM-/i.test(navigator.userAgent);
    
    if (isAndroid) {
        console.log('Aplicando correcciones para Android' + (isSamsung ? ' Samsung' : ''));
        
        // Configurar eventos de toque específicos para Android
        document.addEventListener('touchmove', function(event) {
            // Permitir scroll en contenedores específicos
            const target = event.target.closest('#itemsList, .inventory-container, .offcanvas-body');
            if (target) {
                return; // Permitir scroll normal
            }
            
            // Prevenir scroll en otros elementos si es necesario
            if (event.touches.length > 1) {
                event.preventDefault();
            }
        }, { passive: false });
    }
}

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
    
    renderFilters();
    renderItems(locationName);
    
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

// FUNCIÓN MEJORADA: Redondear números para evitar problemas de precisión
function roundToDecimals(num, decimals = 2) {
    return Math.round((num + Number.EPSILON) * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// FUNCIÓN NUEVA: Formatear número para mostrar
function formatNumber(num) {
    if (num === 0) return '0';
    
    if (num === Math.floor(num)) {
        return num.toString();
    }
    
    const rounded = roundToDecimals(num, 2);
    return rounded.toString().replace(/\.?0+$/, '');
}

// FUNCIÓN MEJORADA: Validar entrada con soporte para operaciones matemáticas
function validateDecimalInput(event) {
    const input = event.target;
    const value = input.value;
    
    // Permitir números, operadores matemáticos básicos, puntos y espacios
    const validPattern = /^[0-9+\-*/.() \s]*$/;
    
    if (!validPattern.test(value)) {
        // Remover caracteres no válidos
        input.value = value.replace(/[^0-9+\-*/.() \s]/g, '');
    }
    
    // Mostrar preview del resultado si hay operadores
    if (/[+\-*/]/.test(value) && value.length > 1) {
        const result = evaluateMathExpression(value);
        if (!isNaN(result)) {
            input.setAttribute('title', `Resultado: ${formatNumber(result)}`);
        } else {
            input.setAttribute('title', 'Operación inválida');
        }
    } else {
        input.removeAttribute('title');
    }
}

// FUNCIÓN MEJORADA: Evaluación de expresiones matemáticas más segura
function evaluateMathExpression(expression) {
    try {
        // Limpiar la expresión y permitir operadores básicos
        const cleanExpression = expression
            .replace(/[^0-9+\-*/.() ]/g, '')
            .replace(/\s+/g, '');
        
        if (!cleanExpression.trim()) {
            return NaN;
        }
        
        // Validar que la expresión sea segura
        if (!/^[0-9+\-*/.() ]+$/.test(cleanExpression)) {
            return NaN;
        }
        
        // Usar Function constructor de forma segura
        const result = new Function('return ' + cleanExpression)();
        
        if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
            return Math.max(0, result); // No permitir valores negativos
        } else {
            return NaN;
        }
    } catch (error) {
        console.warn('Error evaluating math expression:', error);
        return NaN;
    }
}

function showMathError(itemIndex, field) {
    const input = document.querySelector(`[data-index="${itemIndex}"] input[onchange*="${field}"]`);
    if (input) {
        const originalBorder = input.style.border;
        
        input.style.border = '2px solid #dc3545';
        input.style.boxShadow = '0 0 5px rgba(220, 53, 69, 0.3)';
        
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
        
        setTimeout(() => {
            input.style.border = originalBorder;
            input.style.boxShadow = '';
            if (tooltip.parentElement) {
                tooltip.parentElement.removeChild(tooltip);
            }
        }, 2000);
    }
}

// FUNCIÓN MEJORADA: Manejar Enter en inputs con preview
function handleMathKeypress(event, itemIndex, field) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const input = event.target;
        updateQuantity(itemIndex, field, input.value);
        input.blur(); // Cerrar teclado en móviles
    }
}

// FUNCIÓN CORREGIDA: Renderizar items con mejor soporte para touch en Android
function renderItems(locationName) {
    const location = locations[locationName];
    const itemsList = document.getElementById('itemsList');
    itemsList.innerHTML = '';
    
    if (itemsList.sortableInstance) {
        itemsList.sortableInstance.destroy();
        itemsList.sortableInstance = null;
    }
    
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
        
        // EVENTOS TÁCTILES MEJORADOS PARA ANDROID
        if (!location.locked) {
            // Usar eventos táctiles específicos para Android
            itemDiv.addEventListener('touchstart', function(e) {
                if (e.target.closest('input, button, .btn, .drag-handle')) {
                    return;
                }
                e.stopPropagation();
                this.touchStartTime = Date.now();
            }, { passive: true });
            
            itemDiv.addEventListener('touchend', function(e) {
                if (e.target.closest('input, button, .btn, .drag-handle')) {
                    return;
                }
                
                const touchDuration = Date.now() - (this.touchStartTime || 0);
                
                // Solo activar selección si fue un tap corto (no scroll)
                if (touchDuration < 200) {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleItemSelection(originalIndex, itemDiv);
                }
            }, { passive: false });
            
            // Fallback para dispositivos no táctiles
            itemDiv.addEventListener('click', function(e) {
                if (e.target.closest('input, button, .btn, .drag-handle')) {
                    return;
                }
                if (!('ontouchstart' in window)) {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleItemSelection(originalIndex, itemDiv);
                }
            });
        }
        
        const savedQuantities = location.quantities[originalIndex] || {};
        const displayQty = savedQuantities.qty !== undefined ? formatNumber(savedQuantities.qty) : formatNumber(item.qty || 0);
        const displayQty2 = savedQuantities.qty2 !== undefined ? formatNumber(savedQuantities.qty2) : formatNumber(item.qty2 || 0);
        const displayQty3 = savedQuantities.qty3 !== undefined ? formatNumber(savedQuantities.qty3) : formatNumber(item.qty3 || 0);
        
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
                        <div class="col-md-4 col-12 mb-3">
                            <div class="uom-label">${item.uom}</div>
                            <div class="quantity-controls">
                                <div class="btn-group btn-group-sm w-100">
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty', +1)">+1</button>
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty', -1)">-1</button>
                                </div>
                                <input type="text" 
                                       inputmode="decimal" 
                                       class="form-control form-control-sm math-input mobile-dark-text" 
                                       value="${displayQty}" 
                                       onchange="event.stopPropagation(); updateQuantity(${originalIndex}, 'qty', this.value)" 
                                       onkeypress="handleMathKeypress(event, ${originalIndex}, 'qty')"
                                       oninput="validateDecimalInput(event)"
                                       onclick="event.stopPropagation(); this.select();"
                                       placeholder="ej: 7.98, 5+2.5, 10*0.75">
                                <div class="btn-group btn-group-sm w-100">
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty', +0.1)">+0.1</button>
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty', -0.1)">-0.1</button>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        ${item.uom2 ? `
                        <div class="col-md-4 col-12 mb-3">
                            <div class="uom-label">${item.uom2}</div>
                            <div class="quantity-controls">
                                <div class="btn-group btn-group-sm w-100">
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty2', +1)">+1</button>
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty2', -1)">-1</button>
                                </div>
                                <input type="text" 
                                       inputmode="decimal" 
                                       class="form-control form-control-sm math-input mobile-dark-text" 
                                       value="${displayQty2}" 
                                       onchange="event.stopPropagation(); updateQuantity(${originalIndex}, 'qty2', this.value)" 
                                       onkeypress="handleMathKeypress(event, ${originalIndex}, 'qty2')"
                                       oninput="validateDecimalInput(event)"
                                       onclick="event.stopPropagation(); this.select();"
                                       placeholder="ej: 3.25, 8/2, 15-0.5">
                                <div class="btn-group btn-group-sm w-100">
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty2', +0.1)">+0.1</button>
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty2', -0.1)">-0.1</button>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        ${item.uom3 ? `
                        <div class="col-md-4 col-12 mb-3">
                            <div class="uom-label">${item.uom3}</div>
                            <div class="quantity-controls">
                                <div class="btn-group btn-group-sm w-100">
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty3', +1)">+1</button>
                                    <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); adjustQuantity(${originalIndex}, 'qty3', -1)">-1</button>
                                </div>
                                <input type="text" 
                                       inputmode="decimal" 
                                       class="form-control form-control-sm math-input mobile-dark-text" 
                                       value="${displayQty3}" 
                                       onchange="event.stopPropagation(); updateQuantity(${originalIndex}, 'qty3', this.value)" 
                                       onkeypress="handleMathKeypress(event, ${originalIndex}, 'qty3')"
                                       oninput="validateDecimalInput(event)"
                                       onclick="event.stopPropagation(); this.select();"
                                       placeholder="ej: 12.75, 20/4, 2.5*3">
                                <div class="btn-group btn-group-sm w-100">
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
    
    if (!location.locked) {
        setTimeout(() => {
            initSortable();
        }, 100);
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

// Función para alternar selección de items
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

// Actualizar interfaz de selección
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

// Seleccionar todos los items visibles
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

// Limpiar selección
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
        if (itemsList.sortableInstance) {
            itemsList.sortableInstance.destroy();
        }
        
        itemsList.sortableInstance = new Sortable(itemsList, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            
            handle: '.drag-handle',
            filter: '.locked, input, button, .btn',
            preventOnFilter: false,
            
            delay: 100,
            delayOnTouchOnly: true,
            touchStartThreshold: 5,
            fallbackTolerance: 10,
            
            onStart: function(evt) {
                console.log('Iniciando drag');
                
                const draggedIndex = parseInt(evt.item.getAttribute('data-index'));
                
                if (!selectedItems.has(draggedIndex)) {
                    clearSelection();
                    toggleItemSelection(draggedIndex, evt.item);
                }
                
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
                
                document.querySelectorAll('.sortable-chosen, .sortable-drag').forEach(el => {
                    el.classList.remove('sortable-chosen', 'sortable-drag');
                    el.style.opacity = '';
                });
                
                if (selectedItems.size >