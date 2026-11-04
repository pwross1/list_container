const socket = io();

// State
let currentListId = null;
let currentListName = '';
let showCompleted = false;

// DOM Elements
const splashScreen = document.getElementById('splash-screen');
const appContainer = document.getElementById('app');
const viewLists = document.getElementById('view-lists');
const viewItems = document.getElementById('view-items');
const listsContainer = document.getElementById('lists-container');
const activeItemsContainer = document.getElementById('active-items-container');
const completedItemsContainer = document.getElementById('completed-items-container');
const completedSection = document.getElementById('completed-section');
const completedToggleText = document.getElementById('completed-toggle-text');

// 1. Splash Screen Logic (Dismiss after 1.8 seconds)
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    splashScreen.style.opacity = '0';
    setTimeout(() => {
      splashScreen.classList.add('hidden');
      appContainer.classList.remove('hidden');
      socket.emit('get_lists');
    }, 500);
  }, 1800);
});

// 2. Navigation
function showListsView() {
  currentListId = null;
  viewItems.classList.add('hidden');
  viewLists.classList.remove('hidden');
  socket.emit('get_lists');
}

function openListView(id, name) {
  currentListId = id;
  currentListName = name;
  document.getElementById('current-list-title').textContent = name;
  viewLists.classList.add('hidden');
  viewItems.classList.remove('hidden');
  socket.emit('get_items', currentListId);
}

document.getElementById('btn-back').addEventListener('click', showListsView);

// 3. Lists View Events
document.getElementById('btn-add-list').addEventListener('click', () => {
  const name = prompt('Enter List Name (e.g. Grocery, Home Depot):');
  if (name) socket.emit('create_list', name);
});

socket.on('lists_updated', (lists) => {
  listsContainer.innerHTML = '';
  if (lists.length === 0) {
    listsContainer.innerHTML = `<li style="color:var(--text-muted); text-align:center; padding:20px;">No lists yet. Tap "+ New List" above.</li>`;
    return;
  }
  lists.forEach((list) => {
    const li = document.createElement('li');
    li.className = 'list-card';
    li.innerHTML = `
      <span class="list-card-title">${escapeHtml(list.name)}</span>
      <span class="badge">${list.active_count}</span>
    `;
    li.addEventListener('click', () => openListView(list.id, list.name));
    listsContainer.appendChild(li);
  });
});

// Rename / Delete List
document.getElementById('btn-rename-list').addEventListener('click', () => {
  if (!currentListId) return;
  const choice = prompt(`Rename "${currentListName}" to:`, currentListName);
  if (choice && choice.trim()) {
    socket.emit('rename_list', { id: currentListId, name: choice.trim() });
    currentListName = choice.trim();
    document.getElementById('current-list-title').textContent = choice.trim();
  }
});

// 4. Items View Events
document.getElementById('form-add-item').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('input-item-text');
  if (input.value.trim() && currentListId) {
    socket.emit('add_item', { listId: currentListId, text: input.value });
    input.value = '';
  }
});

// Dynamically handle item updates for active list
socket.onAny((event, data) => {
  if (currentListId && event === `items_updated_${currentListId}`) {
    renderItems(data);
  }
});

function renderItems(items) {
  activeItemsContainer.innerHTML = '';
  completedItemsContainer.innerHTML = '';

  const active = items.filter(i => !i.completed);
  const completed = items.filter(i => i.completed);

  // Active items
  if (active.length === 0) {
    activeItemsContainer.innerHTML = `<li style="color:var(--text-muted); text-align:center; padding:15px;">All items completed! 🎉</li>`;
  } else {
    active.forEach(item => activeItemsContainer.appendChild(createItemElement(item)));
  }

  // Completed items accordion
  if (completed.length > 0) {
    completedSection.classList.remove('hidden');
    completedToggleText.textContent = `${showCompleted ? 'Hide' : 'Show'} Checked-Off (${completed.length})`;
    completed.forEach(item => completedItemsContainer.appendChild(createItemElement(item)));
  } else {
    completedSection.classList.add('hidden');
  }
}

function createItemElement(item) {
  const li = document.createElement('li');
  li.className = 'item-card';
  li.innerHTML = `
    <div class="item-left">
      <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''}>
      <span class="item-text">${escapeHtml(item.text)}</span>
    </div>
    <button class="btn-text item-delete">✕</button>
  `;

  // Toggle checked
  li.querySelector('.item-checkbox').addEventListener('change', () => {
    socket.emit('toggle_item', { id: item.id, listId: currentListId });
  });

  // Delete
  li.querySelector('.item-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    socket.emit('delete_item', { id: item.id, listId: currentListId });
  });

  return li;
}

// Toggle Completed Visibility
document.getElementById('toggle-completed').addEventListener('click', (e) => {
  if (e.target.id === 'btn-clear-completed') return;
  showCompleted = !showCompleted;
  completedItemsContainer.classList.toggle('hidden', !showCompleted);
  const count = completedItemsContainer.children.length;
  completedToggleText.textContent = `${showCompleted ? 'Hide' : 'Show'} Checked-Off (${count})`;
});

// Clear Completed
document.getElementById('btn-clear-completed').addEventListener('click', () => {
  if (confirm('Clear all completed items?')) {
    socket.emit('clear_completed', currentListId);
  }
});

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
}