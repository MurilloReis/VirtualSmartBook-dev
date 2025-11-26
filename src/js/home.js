import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- Variáveis de Estado ---
let currentUserId = null;
let userData = {}; // Irá armazenar todos os dados do usuário, incluindo cadernos
const notebookCoverColors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-red-500', 'bg-yellow-500', 'bg-indigo-500'];

// --- Elementos do DOM ---
const myNotebooksGrid = document.getElementById('my-notebooks-grid');
const createNotebookButton = document.getElementById('create-notebook-button');
const logoutButton = document.getElementById('logout-button');
const userMenuButton = document.getElementById('user-menu-button');
const userMenuDropdown = document.getElementById('user-menu-dropdown');
const userDisplayName = document.getElementById('user-display-name');
const noNotebooksMessage = document.getElementById('no-notebooks-message');
const quoteOfTheDayEl = document.getElementById('quote-of-the-day');
const recentDocumentsGrid = document.getElementById('recent-documents-grid');
const noRecentDocumentsMessage = document.getElementById('no-recent-documents-message');
const profileLink = document.getElementById('profile-link'); // Link para o perfil
const darkModeToggleBtn = document.getElementById('dark-mode-toggle-btn'); // <-- ADICIONADO

// --- Elementos do Modal ---
const vsbModal = document.getElementById('vsb-modal');
const vsbModalTitle = document.getElementById('vsb-modal-title');
const vsbModalMessage = document.getElementById('vsb-modal-message');
const vsbModalInput = document.getElementById('vsb-modal-input');
const vsbModalCancelBtn = document.getElementById('vsb-modal-cancel-btn');
const vsbModalConfirmBtn = document.getElementById('vsb-modal-confirm-btn');
let modalConfirmCallback = null;

// --- NOVOS Elementos de Pesquisa ---
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchResultsSection = document.getElementById('search-results-section');
const searchResultsContainer = document.getElementById('search-results-container');
const noSearchResultsMessage = document.getElementById('no-search-results-message');
const recentDocumentsSection = document.getElementById('recent-documents-section');
const myNotebooksSection = document.getElementById('my-notebooks-section');

// --- Citações Motivacionais ---
const motivationalQuotes = [
    { quote: "A educação é a arma mais poderosa que você pode usar para mudar o mundo.", author: "Nelson Mandela" },
    { quote: "O único lugar onde o sucesso vem antes do trabalho é no dicionário.", author: "Vidal Sassoon" },
    { quote: "A mente que se abre a uma nova ideia jamais voltará ao seu tamanho original.", author: "Albert Einstein" },
    { quote: "Estude não para ter um diploma, mas para ter conhecimento.", author: "Autor Desconhecido" },
    { quote: "A persistência é o caminho do êxito.", author: "Charles Chaplin" },
    { quote: "Você ainda não percebeu que você é o único representante do seu sonho na Terra?", author: "Emicida" },
    { quote: "Parasita hoje, um coitado amanhã. Correria hoje, vitória amanhã.", author: "Racionais MC" },
    { quote: "Pensamento é força criadora, o amanhã é ilusório porque ainda não existe, o hoje é real. A oportunidade de mudança está no presente", author: "Racionais MC" }
];

// ==================================================================
// INÍCIO: Lógica do Modo Noturno (ADICIONADO)
// ==================================================================

/**
 * Aplica o estado visual do Modo Noturno (classe no body e ícones).
 * @param {boolean} isDarkMode - True para ativar, false para desativar.
 */
function setDarkModeState(isDarkMode) {
    if (!darkModeToggleBtn) return; // Proteção caso o botão não exista
    const moonIcon = darkModeToggleBtn.querySelector('.fa-moon');
    const sunIcon = darkModeToggleBtn.querySelector('.fa-sun');

    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        if (moonIcon) moonIcon.style.display = 'none';
        // Usamos style.display para sobrescrever o style inline do HTML
        if (sunIcon) sunIcon.style.display = 'inline-block'; 
    } else {
        document.body.classList.remove('dark-mode');
        if (moonIcon) moonIcon.style.display = 'inline-block';
        if (sunIcon) sunIcon.style.display = 'none';
    }
}

/**
 * Alterna o modo noturno e salva a preferência no localStorage.
 */
function toggleDarkMode() {
    const isCurrentlyDarkMode = document.body.classList.contains('dark-mode');
    const newState = !isCurrentlyDarkMode; // O novo estado
    
    setDarkModeState(newState); // Aplica o novo estado visual
    localStorage.setItem('darkMode', newState ? 'enabled' : 'disabled'); // Salva
}

/**
 * (IIFE) Inicializa o modo noturno ao carregar o script.
 */
(function initializeDarkMode() {
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode === 'enabled') {
        setDarkModeState(true);
    } else {
        setDarkModeState(false); // Garante o estado claro se não estiver salvo
    }
})();

// ==================================================================
// FIM: Lógica do Modo Noturno
// ==================================================================


// --- PONTO DE ENTRADA: Verifica o estado de autenticação do usuário ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        const displayName = user.displayName || user.email.split('@')[0];
        const photoURL = user.photoURL;
        const userProfileIconContainer = document.getElementById('user-profile-icon-container');

        document.getElementById('welcome-user-name').textContent = displayName;
        if (userDisplayName) {
            userDisplayName.textContent = displayName;
        }

        if (photoURL && userProfileIconContainer) {
            const profileImg = document.createElement('img');
            profileImg.src = photoURL;
            profileImg.alt = 'Foto de Perfil';
            profileImg.className = 'h-full w-full object-cover'; // Garante que a imagem preencha o container
            
            // Limpa o container e adiciona a imagem
            userProfileIconContainer.innerHTML = '';
            userProfileIconContainer.appendChild(profileImg);
        }

        loadUserData(); 
        displayRandomQuote(); 
    } else {
        window.location.href = 'login.html';
    }
});

// --- FUNÇÕES DE DADOS (FIRESTORE) ---
async function loadUserData() {
    if (!currentUserId) return;
    const userDocRef = doc(db, "notebooks", currentUserId);
    try {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
            userData = docSnap.data();
        } else {
            userData = { notebooks: {} };
        }
        renderNotebooks(); 
        renderRecentDocuments(); 
    } catch (error) {
        console.error("Erro ao carregar dados do usuário:", error);
    }
}

async function saveUserData() {
    if (!currentUserId) return;
    try {
        const userDocRef = doc(db, "notebooks", currentUserId);
        await setDoc(userDocRef, userData);
        console.log("Alterações salvas no Firestore com sucesso.");
    } catch (error) {
        console.error("Erro ao salvar dados:", error);
    }
}

// --- FUNÇÕES DE UI ---
function renderNotebooks() {
    myNotebooksGrid.innerHTML = ''; 
    
    const allNotebooks = Object.keys(userData.notebooks || {}).map(id => ({ id, ...userData.notebooks[id] }));
    const sortedNotebooks = allNotebooks.sort((a, b) => parseInt(a.id.replace('notebook-', '')) - parseInt(b.id.replace('notebook-', '')));

    if (sortedNotebooks.length === 0) {
        if (noNotebooksMessage) noNotebooksMessage.classList.remove('hidden');
        return;
    } else {
        if (noNotebooksMessage) noNotebooksMessage.classList.add('hidden');
    }

    sortedNotebooks.forEach(notebook => {
        const card = document.createElement('div');
        card.className = "notebook-card bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col hover:shadow-lg transition-shadow duration-200";
        const randomColor = notebookCoverColors[Math.floor(Math.random() * notebookCoverColors.length)];
        
        card.innerHTML = `
            <a href="caderno.html?notebookId=${notebook.id}" class="block">
                <div class="notebook-card-cover ${randomColor} flex items-center justify-center">
                    <i class="fas fa-book fa-3x text-white opacity-75"></i>
                </div>
            </a>
            <div class="p-4 flex-grow relative">
                <a href="caderno.html?notebookId=${notebook.id}" class="block">
                    <h3 class="font-semibold text-gray-800 text-base truncate mb-1">${notebook.name}</h3>
                </a>
                <div class="absolute top-2 right-2">
                    <button class="text-gray-400 hover:text-gray-700 notebook-options-button" data-notebook-id="${notebook.id}">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="absolute right-0 mt-2 w-36 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-10 hidden notebook-options-dropdown">
                        <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rename-notebook-option" data-notebook-id="${notebook.id}">Renomear</a>
                        <a href="#" class="block px-4 py-2 text-sm text-red-600 hover:bg-red-50 delete-notebook-option" data-notebook-id="${notebook.id}">Excluir</a>
                    </div>
                </div>
            </div>
        `;
        myNotebooksGrid.appendChild(card);
    });
}

function renderRecentDocuments() {
    recentDocumentsGrid.innerHTML = ''; 
    const allNotebooks = Object.keys(userData.notebooks || {}).map(id => ({ id, ...userData.notebooks[id] }));
    const notebooksToDisplay = allNotebooks.filter(notebook => notebook.lastModified).sort((a, b) => b.lastModified - a.lastModified); 

    if (notebooksToDisplay.length === 0) {
        if (noRecentDocumentsMessage) noRecentDocumentsMessage.classList.remove('hidden');
        return;
    } else {
        if (noRecentDocumentsMessage) noRecentDocumentsMessage.classList.add('hidden');
    }

    notebooksToDisplay.forEach(notebook => {
        const card = document.createElement('div');
        card.className = "notebook-card bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col hover:shadow-lg transition-shadow duration-200";
        const randomColor = notebookCoverColors[Math.floor(Math.random() * notebookCoverColors.length)];
        const numPages = Object.keys(notebook.sections || {}).reduce((acc, sectionId) => acc + Object.keys(notebook.sections[sectionId].pages || {}).length, 0);
        const lastModifiedDate = new Date(notebook.lastModified).toLocaleDateString('pt-BR');

        card.innerHTML = `
            <a href="caderno.html?notebookId=${notebook.id}" class="block">
                <div class="notebook-card-cover ${randomColor} flex items-center justify-center">
                    <i class="fas fa-file-alt fa-3x text-white opacity-75"></i>
                </div>
            </a>
            <div class="p-4 flex-grow relative">
                <a href="caderno.html?notebookId=${notebook.id}" class="block">
                    <h3 class="font-semibold text-gray-800 text-base truncate mb-1">${notebook.name}</h3>
                </a>
                <p class="text-xs text-gray-500">${numPages} página(s)</p>
                <div class="absolute top-2 right-2">
                    <button class="text-gray-400 hover:text-gray-700 notebook-options-button" data-notebook-id="${notebook.id}">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="absolute right-0 mt-2 w-36 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-10 hidden notebook-options-dropdown">
                        <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rename-notebook-option" data-notebook-id="${notebook.id}">Renomear</a>
                        <a href="#" class="block px-4 py-2 text-sm text-red-600 hover:bg-red-50 delete-notebook-option" data-notebook-id="${notebook.id}">Excluir</a>
                    </div>
                </div>
                <div class="p-3 border-t border-gray-100 text-right -mx-4 -mb-4 mt-2">
                    <span class="text-xs text-gray-400">Última mod.: ${lastModifiedDate}</span>
                </div>
            </div>
        `;
        recentDocumentsGrid.appendChild(card);
    });
}

function displayRandomQuote() {
    if (quoteOfTheDayEl) {
        const randomIndex = Math.floor(Math.random() * motivationalQuotes.length);
        const { quote, author } = motivationalQuotes[randomIndex];
        quoteOfTheDayEl.innerHTML = `"${quote}" - <span class="font-semibold">${author}</span>`;
    }
}

// --- LÓGICA DO MODAL ---
function showModal(title, message, showInput, confirmCallback, inputValue = '') {
    if (!vsbModal) return;
    vsbModalTitle.textContent = title;
    vsbModalMessage.textContent = message;
    vsbModalInput.value = inputValue; 
    vsbModalInput.classList.toggle('hidden', !showInput); 
    modalConfirmCallback = confirmCallback;
    vsbModal.classList.remove('hidden');
    void vsbModal.offsetWidth; 
    vsbModal.classList.remove('opacity-0', 'scale-95');
    vsbModal.querySelector('.modal-content').classList.remove('opacity-0', 'scale-95');
    if (showInput) vsbModalInput.focus(); 
}

function hideModal() {
    if (!vsbModal) return; 
    vsbModal.classList.add('opacity-0', 'scale-95');
    setTimeout(() => {
        vsbModal.classList.add('hidden');
    }, 300); 
    modalConfirmCallback = null; 
    vsbModalInput.value = ''; 
}

// --- Funções para gerenciar cadernos na HOME ---
async function renameNotebook(notebookId, newName) {
    if (!currentUserId || !userData.notebooks[notebookId]) return;
    const oldName = userData.notebooks[notebookId].name;
    userData.notebooks[notebookId].name = newName.trim();
    userData.notebooks[notebookId].lastModified = Date.now();
    await saveUserData();
    showModal('Sucesso!', `Caderno "${oldName}" renomeado para "${newName.trim()}" com sucesso!`, false, () => {});
    renderNotebooks();
    renderRecentDocuments();
}

async function deleteNotebook(notebookId) {
    if (!currentUserId || !userData.notebooks[notebookId]) return;
    const notebookName = userData.notebooks[notebookId].name;
    delete userData.notebooks[notebookId];
    await saveUserData();
    showModal('Sucesso!', `Caderno "${notebookName}" excluído com sucesso.`, false, () => {});
    renderNotebooks();
    renderRecentDocuments();
}

// ==================================================================
// INÍCIO: Lógica de Pesquisa
// ==================================================================

function performSearch(query) {
    const lowerCaseQuery = query.toLowerCase();
    const results = [];

    if (!userData.notebooks) return [];

    // Percorre todos os cadernos
    for (const notebookId in userData.notebooks) {
        const notebook = userData.notebooks[notebookId];

        // Percorre todas as seções do caderno
        for (const sectionId in notebook.sections) {
            const section = notebook.sections[sectionId];

            // Percorre todas as páginas da seção
            for (const pageId in section.pages) {
                const page = section.pages[pageId];
                const pageContentText = getTextFromHtml(page.content || '');
                
                // Verifica se o nome da página ou o conteúdo correspondem à pesquisa
                if (page.name.toLowerCase().includes(lowerCaseQuery) || pageContentText.toLowerCase().includes(lowerCaseQuery)) {
                    results.push({
                        notebookId,
                        notebookName: notebook.name,
                        sectionName: section.name,
                        pageId,
                        pageName: page.name,
                        snippet: createSnippet(pageContentText, lowerCaseQuery)
                    });
                }
            }
        }
    }
    return results;
}

function renderSearchResults(results, query) {
    searchResultsContainer.innerHTML = '';

    if (results.length === 0) {
        noSearchResultsMessage.classList.remove('hidden');
        return;
    }

    noSearchResultsMessage.classList.add('hidden');
    const queryRegex = new RegExp(`(${query})`, 'gi');

    results.forEach(result => {
        const resultEl = document.createElement('a');
        resultEl.href = `caderno.html?notebookId=${result.notebookId}&pageId=${result.pageId}`;
        resultEl.className = 'search-result-item';

        // Destaca o termo pesquisado no título e no snippet
        const highlightedTitle = result.pageName.replace(queryRegex, '<mark>$1</mark>');
        const highlightedSnippet = result.snippet.replace(queryRegex, '<mark>$1</mark>');

        resultEl.innerHTML = `
            <h3 class="result-title text-lg">${highlightedTitle}</h3>
            <p class="result-path">${result.notebookName} / ${result.sectionName}</p>
            <p class="result-snippet">${highlightedSnippet}</p>
        `;
        searchResultsContainer.appendChild(resultEl);
    });
}

// Função auxiliar para extrair texto puro do HTML do conteúdo da página
function getTextFromHtml(html) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv.textContent || tempDiv.innerText || '';
}

// Função auxiliar para criar um pequeno trecho do texto encontrado
function createSnippet(text, query) {
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return text.substring(0, 150) + '...';

    const start = Math.max(0, index - 40);
    const end = Math.min(text.length, index + query.length + 40);
    let snippet = text.substring(start, end);

    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    
    return snippet;
}

// ==================================================================
// FIM: Lógica de Pesquisa
// ==================================================================


// --- EVENT LISTENERS ---

// ADICIONADO: Listener para o botão de modo noturno
if (darkModeToggleBtn) {
    darkModeToggleBtn.addEventListener('click', toggleDarkMode);
}

if (createNotebookButton) { 
    createNotebookButton.addEventListener('click', () => {
        showModal('Criar Novo Caderno', 'Qual será o nome do seu caderno?', true, async (notebookName) => {
            if (notebookName && notebookName.trim() !== "") {
                const newNotebookId = `notebook-${Date.now()}`; 
                userData.notebooks[newNotebookId] = { name: notebookName.trim(), sections: {}, lastModified: Date.now() }; 
                await saveUserData(); 
                renderNotebooks(); 
                renderRecentDocuments(); 
            } else {
                showModal('Atenção', 'O nome do caderno não pode estar em branco.', false, () => {});
            }
        });
    });
}

document.addEventListener('click', (event) => {
    if (event.target.closest('.notebook-options-button')) {
        const button = event.target.closest('.notebook-options-button');
        const dropdown = button.nextElementSibling;
        document.querySelectorAll('.notebook-options-dropdown').forEach(d => {
            if (d !== dropdown) d.classList.add('hidden');
        });
        dropdown.classList.toggle('hidden');
        event.stopPropagation();
    } 
    else if (event.target.closest('.rename-notebook-option')) {
        event.preventDefault();
        const notebookId = event.target.dataset.notebookId;
        const currentName = userData.notebooks[notebookId].name;
        showModal('Renomear Caderno', 'Digite o novo nome para o caderno:', true, (newName) => {
            if (newName && newName.trim() !== "" && newName.trim() !== currentName) {
                renameNotebook(notebookId, newName.trim());
            } else if (newName.trim() === "") {
                showModal('Atenção', 'O nome do caderno não pode ser vazio.', false, () => {});
            }
        }, currentName);
        event.target.closest('.notebook-options-dropdown').classList.add('hidden');
    } 
    else if (event.target.closest('.delete-notebook-option')) {
        event.preventDefault();
        const notebookId = event.target.dataset.notebookId;
        const notebookName = userData.notebooks[notebookId].name;
        showModal('Excluir Caderno', `Tem certeza que deseja excluir o caderno "${notebookName}" e todo o seu conteúdo?`, false, (confirm) => {
            if (confirm) deleteNotebook(notebookId);
        });
        event.target.closest('.notebook-options-dropdown').classList.add('hidden');
    } 
    else if (!event.target.closest('.notebook-card')) {
        document.querySelectorAll('.notebook-options-dropdown').forEach(d => d.classList.add('hidden'));
    }
});

if (logoutButton) {
    logoutButton.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await signOut(auth); 
            window.location.href = 'login.html'; 
        } catch (error) {
            console.error("Erro ao fazer logout:", error);
        }
    });
}

if (vsbModalConfirmBtn) {
    vsbModalConfirmBtn.addEventListener('click', () => {
        if (modalConfirmCallback) {
            const inputValue = vsbModalInput.classList.contains('hidden') ? true : vsbModalInput.value;
            modalConfirmCallback(inputValue);
        }
        hideModal(); 
    });
}

if (vsbModalCancelBtn) {
    vsbModalCancelBtn.addEventListener('click', () => hideModal());
}

if (userMenuButton) {
    userMenuButton.addEventListener('click', (event) => {
        event.stopPropagation(); 
        if (userMenuDropdown) userMenuDropdown.classList.toggle('hidden'); 
    });
}

// **NOVO** Adicionado o listener para o link do perfil
if (profileLink) {
    profileLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'perfil.html';
    });
}

document.addEventListener('click', (event) => {
    if (userMenuButton && userMenuDropdown && !userMenuButton.contains(event.target) && !userMenuDropdown.contains(event.target)) {
        userMenuDropdown.classList.add('hidden'); 
    }
});

// --- NOVO Event Listener para a Pesquisa ---
if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault(); // Impede o recarregamento da página
        const query = searchInput.value.trim();
        if (query) {
            const results = performSearch(query);
            renderSearchResults(results, query);
            // Mostra a seção de resultados e esconde as outras
            searchResultsSection.classList.remove('hidden');
            recentDocumentsSection.classList.add('hidden');
            myNotebooksSection.classList.add('hidden');
        }
    });
}

if (searchInput) {
    // Listener para limpar a pesquisa e restaurar a visualização normal
    searchInput.addEventListener('input', () => {
        if (searchInput.value.trim() === '') {
            searchResultsSection.classList.add('hidden');
            searchResultsContainer.innerHTML = '';
            recentDocumentsSection.classList.remove('hidden');
            myNotebooksSection.classList.remove('hidden');
        }
    });
}

const currentYearEl = document.getElementById('currentYear');
if (currentYearEl) currentYearEl.textContent = new Date().getFullYear();