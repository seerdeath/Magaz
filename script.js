// Переключаем скрипт на использование данных из Supabase
const SUPABASE_URL = "https://neexdqhivtlilsgnfriy.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lZXhkcWhpdnRsaWxzZ25mcml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzQ5MDQsImV4cCI6MjA5NzQ1MDkwNH0.DkEprA84Ls65wbIQforcWH2nHmCURj4sQn47wQvfXHs";

const supabase = ::supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Ссылки на элементы DOM
const DOM = {
    catalogBar: document.getElementById('catalogBar'),
    productsGrid: document.getElementById('productsGrid'),
    cartCount: document.getElementById('cartCount'),
    cartTotal: document.getElementById('cartTotal'),
    cartItems: document.getElementById('cartItems'),
    btnCheckout: document.getElementById('btnCheckout'),
    cartPanel: document.getElementById('cartPanel'),
    cartOverlay: document.getElementById('cartOverlay'),
    checkoutModal: document.getElementById('checkoutModal'),
    checkoutInner: document.getElementById('checkoutModalInner'),
    toast: document.getElementById('toast'),
    btnToggleCart: document.getElementById('btnToggleCart'),
    btnCloseCart: document.getElementById('btnCloseCart'),
    // Новые элементы
    logoLink: document.getElementById('logoLink'),
    btnFavorites: document.getElementById('btnFavorites'),
    btnAuthToggle: document.getElementById('btnAuthToggle'),
    profileName: document.getElementById('profileName'),
    btnAdminPanel: document.getElementById('btnAdminPanel'),
    mainContent: document.getElementById('mainContent'),
    profileSection: document.getElementById('profileSection'),
    adminSection: document.getElementById('adminSection'),
    userEmailText: document.getElementById('userEmailText'),
    userRoleText: document.getElementById('userRoleText'),
    btnLogout: document.getElementById('btnLogout'),
    orderHistoryList: document.getElementById('orderHistoryList'),
    searchBar: document.getElementById('searchBar'),
    sortBy: document.getElementById('sortBy'),
    statsCount: document.getElementById('statsCount'),
    // Элементы Модалки Auth
    authModal: document.getElementById('authModal'),
    btnCloseAuth: document.getElementById('btnCloseAuth'),
    authForm: document.getElementById('authForm'),
    authEmail: document.getElementById('authEmail'),
    authPassword: document.getElementById('authPassword'),
    authModalTitle: document.getElementById('authModalTitle'),
    authBtnSubmit: document.getElementById('btnAuthSubmit'),
    authSwitchText: document.getElementById('authSwitchText'),
    linkSwitchAuth: document.getElementById('linkSwitchAuth'),
    // Админка элементы
    tabProducts: document.getElementById('tabAdminProducts'),
    tabOrders: document.getElementById('tabAdminOrders'),
    tabUsers: document.getElementById('tabAdminUsers'),
    viewProducts: document.getElementById('adminProductsView'),
    viewOrders: document.getElementById('adminOrdersView'),
    viewUsers: document.getElementById('adminUsersView'),
    productForm: document.getElementById('productForm'),
    adminProductsList: document.getElementById('adminProductsList'),
    adminOrdersList: document.getElementById('adminOrdersList'),
    adminUsersList: document.getElementById('adminUsersList')
};

// Состояние приложения
let state = {
    user: null,
    profile: null,
    products: [],
    categories: ['Все'],
    cart: [],
    favorites: new Set(),
    activeCategory: 'Все',
    searchQuery: '',
    currentSort: 'novelty',
    isSignUpMode: false,
    view: 'store' // 'store', 'profile', 'admin'
};

// ==================== ИНИЦИАЛИЗАЦИЯ И ПОЛУЧЕНИЕ ДАННЫХ ====================

async function init() {
    setupEventListeners();
    await checkUserSession();
    await fetchProducts();
    await fetchCategories();
    renderAll();
}

async function checkUserSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        state.user = session.user;
        // Загружаем профиль с ролью
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', state.user.id).single();
        state.profile = profile;
        
        DOM.profileName.textContent = profile?.full_name || state.user.email.split('@')[0];
        DOM.userEmailText.textContent = state.user.email;
        DOM.userRoleText.textContent = profile?.role || 'User';

        if (profile?.role === 'Admin') {
            DOM.btnAdminPanel.classList.remove('hidden');
        }
        // Загружаем корзину и избранное пользователя из БД
        await syncUserCartAndFavorites();
    } else {
        resetUserState();
    }
}

function resetUserState() {
    state.user = null;
    state.profile = null;
    state.cart = [];
    state.favorites.clear();
    DOM.profileName.textContent = "Войти";
    DOM.btnAdminPanel.classList.add('hidden');
    switchView('store');
}

async function fetchProducts() {
    let { data, error } = await supabase.from('products').select('*');
    if (!error) {
        state.products = data;
        DOM.statsCount.textContent = data.length;
    }
}

async function fetchCategories() {
    let { data } = await supabase.from('products').select('category');
    if (data) {
        const cats = new Set(data.map(p => p.category));
        state.categories = ['Все', ...cats];
    }
}

async function syncUserCartAndFavorites() {
    if (!state.user) return;
    // Корзина
    const { data: cartData } = await supabase.from('cart_items').select('*, products(*)').eq('user_id', state.user.id);
    if (cartData) {
        state.cart = cartData.map(item => ({
            id: item.product_id,
            qty: item.quantity,
            name: item.products.name,
            price: item.products.price,
            image_url: item.products.image_url,
            category: item.products.category
        }));
    }
    // Избранное
    const { data: favData } = await supabase.from('favorites').select('product_id').eq('user_id', state.user.id);
    if (favData) {
        state.favorites = new Set(favData.map(f => f.product_id));
    }
}

// ==================== ОТРИСОВКА ИНТЕРФЕЙСА (RENDER) ====================

function renderAll() {
    renderCategoryBar();
    renderProducts();
    updateCartUI();
}

function renderCategoryBar() {
    DOM.catalogBar.innerHTML = state.categories.map(cat => `
        <button class="catalog-chip ${cat === state.activeCategory ? 'active' : ''}" data-cat="${cat}">${cat}</button>
    `).join('');
}

function renderProducts() {
    // 1. Фильтрация по категориям
    let filtered = state.activeCategory === 'Все' ? state.products : state.products.filter(p => p.category === state.activeCategory);

    // 2. Фильтрация по поиску
    if (state.searchQuery) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(state.searchQuery.toLowerCase()) || (p.description && p.description.toLowerCase().includes(state.searchQuery.toLowerCase())));
    }

    // 3. Сортировка
    if (state.currentSort === 'price_asc') filtered.sort((a, b) => a.price - b.price);
    else if (state.currentSort === 'price_desc') filtered.sort((a, b) => b.price - a.price);
    else if (state.currentSort === 'popularity') filtered.sort((a, b) => b.sales_count - a.sales_count);
    else if (state.currentSort === 'novelty') filtered.sort((a, b) => b.is_new - a.is_new || new Date(b.created_at) - new Date(a.created_at));

    DOM.productsGrid.innerHTML = filtered.map(p => {
        const inCart = state.cart.some(item => item.id === p.id);
        const isFav = state.favorites.has(p.id);
        const img = p.image_url || 'https://via.placeholder.com/400x500?text=No+Image';
        
        return `
        <div class="product-card">
          <div class="product-image-wrap" style="background-image:url('${img}'); background-size:cover; background-position:center;">
            ${p.is_new ? '<div class="badge">NEW</div>' : ''}
            ${p.is_sale ? '<div class="badge sale">SALE</div>' : ''}
            <button class="btn-heart toggle-fav-btn" data-id="${p.id}" style="color: ${isFav ? 'var(--danger)' : 'var(--text-secondary)'}">❤️</button>
          </div>
          <div class="product-category">${p.category.toUpperCase()}</div>
          <div class="product-name">${p.name}</div>
          <div class="product-footer">
            <span class="product-price">${Number(p.price).toLocaleString()} ₸</span>
            <button class="btn-add to-cart-btn ${inCart ? 'in-cart' : ''}" data-id="${p.id}">
              ${inCart ? '✓' : '+'}
            </button>
          </div>
        </div>
    `;}).join('');
}

function updateCartUI() {
    const count = state.cart.reduce((acc, i) => acc + i.qty, 0);
    const total = state.cart.reduce((acc, i) => acc + (i.price * i.qty), 0);

    DOM.cartCount.textContent = count > 0 ? count : '';
    DOM.cartTotal.textContent = `${total.toLocaleString()} ₸`;
    DOM.btnCheckout.disabled = state.cart.length === 0;

    if (state.cart.length === 0) {
        DOM.cartItems.innerHTML = '<div class="cart-empty-state">Ваша корзина пуста</div>';
        return;
    }
DOM.cartItems.innerHTML = state.cart.map(item => `
      <div class="cart-item">
        <div class="cart-item-img" style="background-image:url('${item.image_url || ''}'); background-size:cover; background-position:center;"></div>
        <div class="cart-item-info">
          <div class="cart-item-cat">${item.category}</div>
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${Number(item.price).toLocaleString()} ₸</div>
        </div>
        <div class="cart-item-controls">
          <button class="btn-remove remove-cart-btn" data-id="${item.id}">Удалить</button>
          <div class="cart-item-qty">
            <button class="qty-btn qty-minus" data-id="${item.id}">−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn qty-plus" data-id="${item.id}">+</button>
          </div>
        </div>
      </div>
    `).join('');
}

// ==================== СИСТЕМА МАРШРУТИЗАЦИИ (VIEWS) ====================

function switchView(viewName) {
    state.view = viewName;
    DOM.mainContent.classList.add('hidden');
    DOM.profileSection.classList.add('hidden');
    DOM.adminSection.classList.add('hidden');

    if (viewName === 'store') DOM.mainContent.classList.remove('hidden');
    else if (viewName === 'profile') {
        DOM.profileSection.classList.remove('hidden');
        loadOrderHistory();
    }
    else if (viewName === 'admin') {
        DOM.adminSection.classList.remove('hidden');
        loadAdminProducts();
    }
}

// ==================== АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ ====================

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = DOM.authEmail.value.trim();
    const password = DOM.authPassword.value;

    if (state.isSignUpMode) {
        // Регистрация
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) return showToast(`Ошибка регистрации: ${error.message}`);
        showToast('Успешная регистрация! Подтвердите Email или войдите.');
    } else {
        // Вход
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return showToast(`Ошибка входа: ${error.message}`);
        showToast('Вы успешно вошли!');
        await checkUserSession();
        DOM.authModal.classList.remove('open');
    }
    DOM.authForm.reset();
}

// ==================== ФУНКЦИОНАЛ КОРЗИНЫ И ИЗБРАННОГО ====================

async function toggleFavorite(id) {
    if (!state.user) return DOM.authModal.classList.add('open');

    if (state.favorites.has(id)) {
        await supabase.from('favorites').delete().eq('user_id', state.user.id).eq('product_id', id);
        state.favorites.delete(id);
        showToast('Удалено из избранного');
    } else {
        await supabase.from('favorites').insert({ user_id: state.user.id, product_id: id });
        state.favorites.add(id);
        showToast('Добавлено в избранное');
    }
    renderProducts();
}

async function addToCart(id) {
    if (!state.user) return DOM.authModal.classList.add('open');
    const existing = state.cart.find(i => i.id === id);

    if (!existing) {
        const prod = state.products.find(p => p.id === id);
        await supabase.from('cart_items').insert({ user_id: state.user.id, product_id: id, quantity: 1 });
        state.cart.push({ ...prod, qty: 1 });
        showToast('Добавлено в корзину');
    }
    updateCartUI();
    renderProducts();
}

async function updateCartQuantity(id, delta) {
    const item = state.cart.find(i => i.id === id);
    if (!item) return;

    item.qty += delta;
    if (item.qty <= 0) {
        await supabase.from('cart_items').delete().eq('user_id', state.user.id).eq('product_id', id);
        state.cart = state.cart.filter(i => i.id !== id);
        showToast('Товар удален из корзины');
    } else {
        await supabase.from('cart_items').update({ quantity: item.qty }).eq('user_id', state.user.id).eq('product_id', id);
    }
    updateCartUI();
    renderProducts();
}

// ==================== ОФОРМЛЕНИЕ ЗАКАЗА ====================

window.openCheckout = function() {
    const total = state.cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
    DOM.checkoutInner.innerHTML = `
    <div class="modal-header"><h3>Оформление заказа</h3><button class="btn-close" onclick="closeCheckout()">✕</button></div>
    <div class="modal-body">
      <div class="form-group"><label>Имя получателя</label><input type="text" id="orderName" required></div>
      <div class="form-group"><label>Телефон для связи</label><input type="tel" id="orderPhone" placeholder="+7..." required></div>
      <button class="btn-primary" id="btnSubmitFinalOrder">Подтвердить заказ на ${total.toLocaleString()} ₸</button>
    </div>`;
    DOM.checkoutModal.classList.add('open');
    
    document.getElementById('btnSubmitFinalOrder').onclick = submitFinalOrder;
};

async function submitFinalOrder() {
    const name = document.getElementById('orderName').value.trim();
    const phone = document.getElementById('orderPhone').value.trim();
    if (!name || !phone) return showToast('Заполните обязательные поля');

    const total = state.cart.reduce((acc, i) => acc + (i.price * i.qty), 0);

    // 1. Создаем заказ в таблице orders
    const { data: order, error } = await supabase.from('orders').insert({
        user_id: state.user.id,
        total_amount: total,
        customer_name: name,
        customer_email: state.user.email,
        customer_phone: phone,
        status: 'Новый'
    }).select().single();

    if (error) return showToast('Ошибка при создании заказа');

    // 2. Добавляем элементы заказа
    const itemsToInsert = state.cart.map(item => ({
        order_id: order.id,
        product_id: item.id,
        quantity: item.qty,
        price_at_purchase: item.price
    }));
    await supabase.from('order_items').insert(itemsToInsert);

    // 3. Очищаем корзину в БД и локально
    await supabase.from('cart_items').delete().eq('user_id', state.user.id);
    state.cart = [];
    
    showToast('Заказ успешно создан!');
    DOM.checkoutModal.classList.remove('open');
    DOM.cartPanel.classList.remove('open');
    DOM.cartOverlay.classList.remove('open');
    
    updateCartUI();
    renderProducts();
async function loadOrderHistory() {
    DOM.orderHistoryList.innerHTML = 'Загрузка...';
    const { data: orders } = await supabase.from('orders').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false });
    
    if (!orders || orders.length === 0) {
        DOM.orderHistoryList.innerHTML = 'У вас пока нет оформленных заказов.';
        return;
    }

    DOM.orderHistoryList.innerHTML = orders.map(o => `
        <div class="order-history-card">
            <div style="display:flex; justify-content:between; align-items:center;">
                <strong>Заказ №${o.id}</strong>
                <span class="status-badge status-${o.status}">${o.status}</span>
            </div>
            <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px;">
                Дата: ${new Date(o.created_at).toLocaleDateString()}<br>
                Сумма: ${Number(o.total_amount).toLocaleString()} ₸
            </p>
        </div>
    `).join('');
}

// ==================== АДМИНИСТРАТИВНАЯ ПАНЕЛЬ ====================

async function loadAdminProducts() {
    const { data } = await supabase.from('products').select('*').order('id', { ascending: false });
    DOM.adminProductsList.innerHTML = data.map(p => `
        <div class="admin-item-row">
            <div>
                <strong>${p.name}</strong> (${Number(p.price).toLocaleString()} ₸) - Склад: ${p.stock}
            </div>
            <div class="admin-item-actions">
                <button class="catalog-chip active edit-prod-btn" data-id="${p.id}" style="background:#3498db; color:#fff;">Ред.</button>
                <button class="catalog-chip active delete-prod-btn" data-id="${p.id}" style="background:var(--danger); color:#fff;">Удал.</button>
            </div>
        </div>
    `).join('');
}

async function handleProductFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editProductId').value;
    const name = document.getElementById('prodName').value;
    const description = document.getElementById('prodDesc').value;
    const price = parseFloat(document.getElementById('prodPrice').value);
    const category = document.getElementById('prodCategory').value;
    const stock = parseInt(document.getElementById('prodStock').value);
    const isNew = document.getElementById('prodIsNew').checked;
    const isSale = document.getElementById('prodIsSale').checked;
    const fileInput = document.getElementById('prodImage');

    let image_url = null;
    
    // Загрузка фото в Supabase Storage, если файл выбран
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        let { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, file);
        if (uploadError) return showToast('Ошибка при загрузке фото');
        
        const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(filePath);
        image_url = publicUrlData.publicUrl;
    }

    const payload = { name, description, price, category, stock, is_new: isNew, is_sale: isSale };
    if (image_url) payload.image_url = image_url;

    if (id) {
        // Редактирование товара
        await supabase.from('products').update(payload).eq('id', id);
        showToast('Товар обновлен');
    } else {
        // Создание нового товара
        await supabase.from('products').insert(payload);
        showToast('Товар успешно создан');
    }

    DOM.productForm.reset();
    document.getElementById('editProductId').value = '';
    await fetchProducts();
    await fetchCategories();
    renderAll();
    loadAdminProducts();
}

async function deleteProduct(id) {
    if (confirm('Вы уверены, что хотите удалить этот товар?')) {
        await supabase.from('products').delete().eq('id', id);
        showToast('Товар удален');
        await fetchProducts();
        renderAll();
        loadAdminProducts();
    }
}
async function editProduct(id) {
    const p = state.products.find(prod => prod.id === parseInt(id));
    if (!p) return;

    document.getElementById('editProductId').value = p.id;
    document.getElementById('prodName').value = p.name;
    document.getElementById('prodDesc').value = p.description || '';
    document.getElementById('prodPrice').value = p.price;
    document.getElementById('prodCategory').value = p.category;
    document.getElementById('prodStock').value = p.stock;
    document.getElementById('prodIsNew').checked = p.is_new;
    document.getElementById('prodIsSale').checked = p.is_sale;
    
    DOM.productForm.scrollIntoView({ behavior: 'smooth' });
}

// ==================== СОБЫТИЯ (EVENT LISTENERS) ====================

function setupEventListeners() {
    // Навигация
    DOM.logoLink.onclick = (e) => { e.preventDefault(); switchView('store'); };
    DOM.btnAuthToggle.onclick = () => {
        if (state.user) switchView('profile');
        else DOM.authModal.classList.add('open');
    };
    DOM.btnAdminPanel.onclick = () => switchView('admin');
    DOM.btnLogout.onclick = async () => { await supabase.auth.signOut(); resetUserState(); showToast('Вы вышли из системы'); };

    // Поиск и сортировка
    DOM.searchBar.oninput = (e) => { state.searchQuery = e.target.value; renderProducts(); };
    DOM.sortBy.onchange = (e) => { state.currentSort = e.target.value; renderProducts(); };

    // Выбор категории
    DOM.catalogBar.onclick = (e) => {
        const chip = e.target.closest('.catalog-chip');
        if (!chip) return;
        state.activeCategory = chip.dataset.cat;
        renderCategoryBar();
        renderProducts();
    };

    // Авторизация
    DOM.btnCloseAuth.onclick = () => DOM.authModal.classList.remove('open');
    DOM.authForm.onsubmit = handleAuthSubmit;
    DOM.linkSwitchAuth.onclick = (e) => {
        e.preventDefault();
        state.isSignUpMode = !state.isSignUpMode;
        DOM.authModalTitle.textContent = state.isSignUpMode ? "Регистрация аккаунта" : "Вход в аккаунт";
        DOM.authBtnSubmit.textContent = state.isSignUpMode ? "Зарегистрироваться" : "Войти";
        DOM.authSwitchText.textContent = state.isSignUpMode ? "Уже есть аккаунт?" : "Нет аккаунта?";
        DOM.linkSwitchAuth.textContent = state.isSignUpMode ? "Войти" : "Зарегистрироваться";
    };

    // Клик внутри грида товаров (делегирование событий)
    DOM.productsGrid.onclick = (e) => {
        const id = parseInt(e.target.dataset.id);
        if (!id) return;
        if (e.target.classList.contains('to-cart-btn')) addToCart(id);
        if (e.target.classList.contains('toggle-fav-btn')) toggleFavorite(id);
    };

    // Корзина панели клики
    DOM.cartItems.onclick = (e) => {
        const id = parseInt(e.target.dataset.id);
        if (!id) return;
        if (e.target.classList.contains('qty-plus')) updateCartQuantity(id, 1);
        if (e.target.classList.contains('qty-minus')) updateCartQuantity(id, -1);
        if (e.target.classList.contains('remove-cart-btn')) updateCartQuantity(id, -Infinity);
    };

    DOM.btnToggleCart.onclick = () => { DOM.cartPanel.classList.add('open'); DOM.cartOverlay.classList.add('open'); };
    DOM.btnCloseCart.onclick = () => { DOM.cartPanel.classList.remove('open'); DOM.cartOverlay.classList.remove('open'); };
    DOM.cartOverlay.onclick = () => { DOM.cartPanel.classList.remove('open'); DOM.cartOverlay.classList.remove('open'); };
    DOM.btnCheckout.onclick = () => window.openCheckout();

    // Админка
    DOM.productForm.onsubmit = handleProductFormSubmit;
    DOM.adminProductsList.onclick = (e) => {
        const id = e.target.dataset.id;
        if (!id) return;
        if (e.target.classList.contains('delete-prod-btn')) deleteProduct(id);
        if (e.target.classList.contains('edit-prod-btn')) editProduct(id);
    };

    // Табы админки
    DOM.tabProducts.onclick = () => { toggleAdminTab(DOM.tabProducts, DOM.viewProducts); loadAdminProducts(); };
    DOM.tabOrders.onclick = async () => { 
        toggleAdminTab(DOM.tabOrders, DOM.viewOrders);
        const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
        DOM.adminOrdersList.innerHTML = data.map(o => `
            <div class="admin-item-row">
                <div>Заказ №${o.id} - ${o.customer_name} (${Number(o.total_amount).toLocaleString()} ₸)</div>
                <select class="store-select admin-status-select" data-id="${o.id}">
                    <option value="Новый" ${o.status === 'Новый' ? 'selected' : ''}>Новый</option>
                    <option value="Оплачен" ${o.status === 'Оплачен' ? 'selected' : ''}>Оплачен</option>
                    <option value="Доставлен" ${o.status === 'Доставлен' ? 'selected' : ''}>Доставлен</option>
                    <option value="Отменен" ${o.status === 'Отменен' ? 'selected' : ''}>Отменен</option>
                </select>
            </div>
        `).join('');
    };
    DOM.tabUsers.onclick = async () => {
        toggleAdminTab(DOM.tabUsers, DOM.viewUsers);
        const { data } = await supabase.from('profiles').select('*');
        DOM.adminUsersList.innerHTML = data.map(u => `<div class="admin-item-row"><div>${u.email} - Роль: <strong>${u.role}</strong></div></div>`).join('');
    };

    // Изменение статуса заказа админом
    DOM.adminOrdersList.onchange = async (e) => {
        if (e.target.classList.contains('admin-status-select')) {
            const id = e.target.dataset.id;
            const newStatus = e.target.value;
            await supabase.from('orders').update({ status: newStatus }).eq('id', id);
            showToast(`Статус заказа №${id} изменен на ${newStatus}`);
        }
    };
}
function toggleAdminTab(activeTab, activeView) {
    [DOM.tabProducts, DOM.tabOrders, DOM.tabUsers].forEach(t => t.classList.remove('active'));
    [DOM.viewProducts, DOM.viewOrders, DOM.viewUsers].forEach(v => v.classList.add('hidden'));
    activeTab.classList.add('active');
    activeView.classList.remove('hidden');
}

function showToast(msg) {
    DOM.toast.textContent = msg;
    DOM.toast.classList.add('show');
    setTimeout(() => DOM.toast.classList.remove('show'), 2500);
}

window.closeCheckout = () => DOM.checkoutModal.classList.remove('open');

// Поехали!
init();