import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";


// --- Variáveis de Estado Globais ---
const functions = getFunctions();
const summarizeText = httpsCallable(functions, 'summarizeText');
const generateMindMap = httpsCallable(functions, 'generateMindMap');
let userData = {};
let currentUserId = null;
let activeNotebookId = null;
let activeSectionId = null;
let activePageId = null;
let saveTimeout = null;
let studyTimeInterval = null; // Cronômetro para o tempo total do usuário
let notebookChronometerInterval = null; // Cronômetro para o caderno específico
let lastEditorSelection = null;

// --- Elementos do DOM ---
const chronometerDisplayEl = document.getElementById('notebook-chronometer');
const activeNotebookNameEl = document.getElementById('active-notebook-name');
const sectionsList = document.getElementById('sections-list');
const pagesList = document.getElementById('pages-list');
const addSectionBtn = document.getElementById('add-section-btn');
const addPageBtn = document.getElementById('add-page-btn');
const pageContent = document.getElementById('page-content');
const currentPageTitle = document.getElementById('current-page-title');
const pageRenderArea = document.getElementById('page-render-area');
const customContextMenu = document.getElementById('custom-context-menu');
const summarizeBtn = document.getElementById('summarize-btn');
const mindMapBtn = document.getElementById('mind-map-btn');
const confirmationModal = document.getElementById('confirmation-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalInput = document.getElementById('modal-input');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const modalButtons = document.getElementById('modal-buttons');
const modalSpinner = document.getElementById('modal-spinner');
let modalConfirmCallback = null;
const summariesCountBadge = document.getElementById('summaries-count-badge');
const summariesModal = document.getElementById('summaries-modal');
const summariesModalCloseBtn = document.getElementById('summaries-modal-close-btn');
const summariesListContainer = document.getElementById('summaries-list-container');
const mindMapModal = document.getElementById('mind-map-modal');
const mindMapModalCloseBtn = document.getElementById('mind-map-modal-close-btn');
const mindMapContainer = document.getElementById('mind-map-container');
const saveStatusEl = document.getElementById('save-status');

// --- Elementos do Painel de Artefatos IA ---
const aiPanel = document.getElementById('ai-panel');
const toggleAiPanelBtn = document.getElementById('toggle-ai-panel-btn');
const closeAiPanelBtn = document.getElementById('close-ai-panel-btn');
const tabSummaries = document.getElementById('tab-summaries');
const tabMindmaps = document.getElementById('tab-mindmaps');
const aiSummariesContent = document.getElementById('ai-summaries-content');
const aiMindmapsContent = document.getElementById('ai-mindmaps-content');
const summariesBadge = document.getElementById('summaries-badge');
const mindmapsBadge = document.getElementById('mindmaps-badge');
const totalArtifactsBadge = document.getElementById('total-artifacts-badge');
const boldBtn = document.getElementById('bold-btn');
const italicBtn = document.getElementById('italic-btn');
const underlineBtn = document.getElementById('underline-btn');
const strikethroughBtn = document.getElementById('strikethrough-btn');
const headingSelect = document.getElementById('heading-select');
const alignLeftBtn = document.getElementById('align-left-btn');
const alignCenterBtn = document.getElementById('align-center-btn');
const alignRightBtn = document.getElementById('align-right-btn');
const alignJustifyBtn = document.getElementById('align-justify-btn');
const ulBtn = document.getElementById('ul-btn');
const olBtn = document.getElementById('ol-btn');
const removeFormatBtn = document.getElementById('remove-format-btn');
const fontFamilySelect = document.getElementById('font-family-select');
const fontSizeSelect = document.getElementById('font-size-select');
const renameNotebookBtn = document.getElementById('rename-notebook-btn');
const deleteNotebookBtn = document.getElementById('delete-notebook-btn');
const renameSectionBtn = document.getElementById('rename-section-btn');
const deleteSectionBtn = document.getElementById('delete-section-btn');
const renamePageBtn = document.getElementById('rename-page-btn');
const deletePageBtn = document.getElementById('delete-page-btn');
const exportMdBtn = document.getElementById('export-md-btn');
const exportPdfBtn = document.getElementById('export-pdf-btn');
const darkModeToggleBtn = document.getElementById('dark-mode-toggle-btn'); // <-- ADICIONADO


// =================================================================================
// LÓGICA DO MODO NOTURNO (ADICIONADO)
// =================================================================================

/**
 * Aplica ou remove a classe 'dark-mode' do body.
 * @param {boolean} enabled - True para adicionar, false para remover.
 */
function applyDarkMode(enabled) {
    if (enabled) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

/**
 * Alterna o modo noturno, atualiza o body e salva no localStorage.
 */
function toggleDarkMode() {
    const isDarkMode = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDarkMode ? 'enabled' : 'disabled');
}

/**
 * (IIFE) Inicializa o modo noturno ao carregar o script para evitar "flash"
 * de tema claro.
 */
(function initializeDarkMode() {
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode === 'enabled') {
        applyDarkMode(true);
    }
})();

// =================================================================================
// PONTO DE ENTRADA E LÓGICA DE DADOS
// =================================================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        const urlParams = new URLSearchParams(window.location.search);
        activeNotebookId = urlParams.get('notebookId');
        if (!activeNotebookId) {
            document.body.innerHTML = '<h1>Erro: ID do caderno não fornecido. Volte para a página inicial.</h1>';
            return;
        }
        loadInitialData();
        startStudyTimeTracker(); // Continua rastreando o tempo total do usuário
    } else {
        window.location.href = 'login.html';
    }
});

// Função para rastrear o tempo de estudo TOTAL do usuário
function startStudyTimeTracker() {
    if (studyTimeInterval) clearInterval(studyTimeInterval);
    studyTimeInterval = setInterval(() => {
        if (!currentUserId) return;
        const userDocRef = doc(db, "notebooks", currentUserId);
        updateDoc(userDocRef, { totalStudyTimeInSeconds: increment(60) })
            .catch(err => {
                if (err.code === 'not-found' || err.message.includes("No document to update")) {
                    setDoc(userDocRef, { totalStudyTimeInSeconds: 60 }, { merge: true });
                }
            });
    }, 60000);
}

// Função para o cronômetro do caderno específico
function startNotebookChronometer() {
    if (notebookChronometerInterval) clearInterval(notebookChronometerInterval);

    const notebook = userData.notebooks[activeNotebookId];
    if (!notebook) return;

    let notebookSeconds = notebook.studyTimeInSeconds || 0;
    
    // Atualiza a tela imediatamente com o valor salvo
    if (chronometerDisplayEl) {
        chronometerDisplayEl.textContent = formatTime(notebookSeconds);
    }

    // Inicia o contador
    notebookChronometerInterval = setInterval(() => {
        notebookSeconds++;
        
        if (chronometerDisplayEl) {
            chronometerDisplayEl.textContent = formatTime(notebookSeconds);
        }

        if (notebookSeconds % 60 === 0) {
            const notebookRef = `notebooks.${activeNotebookId}.studyTimeInSeconds`;
            const userDocRef = doc(db, "notebooks", currentUserId);
            updateDoc(userDocRef, { [notebookRef]: notebookSeconds })
                .catch(err => {
                    console.error("Erro ao salvar tempo do caderno:", err);
                });
        }
    }, 1000);
}

// Função para formatar segundos em HH:MM:SS
function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

async function loadInitialData() {
    const userDocRef = doc(db, "notebooks", currentUserId);
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
        userData = docSnap.data();
        if (userData.notebooks && userData.notebooks[activeNotebookId]) {
            userData.notebooks[activeNotebookId].lastModified = Date.now();
            await saveChanges(false);
            startNotebookChronometer();
        }
        render();
    } else {
        document.body.innerHTML = '<h1>Erro: Não foi possível carregar os dados do utilizador.</h1>';
    }
}

async function saveChanges(showStatus = true) {
    if (!currentUserId) return;
    if (saveStatusEl && showStatus) {
        saveStatusEl.textContent = 'A salvar...';
        saveStatusEl.classList.remove('text-gray-500', 'text-green-600', 'text-red-500');
        saveStatusEl.classList.add('text-blue-500');
    }
    try {
        const userDocRef = doc(db, "notebooks", currentUserId);
        await setDoc(userDocRef, userData, { merge: true });
        if (saveStatusEl && showStatus) {
            saveStatusEl.textContent = 'Salvo!';
            saveStatusEl.classList.remove('text-blue-500', 'text-red-500');
            saveStatusEl.classList.add('text-green-600');
            setTimeout(() => {
                saveStatusEl.textContent = '';
            }, 2000);
        }
    } catch (error) {
        console.error("Erro ao salvar dados:", error);
        if (saveStatusEl && showStatus) {
            saveStatusEl.textContent = 'Erro ao salvar!';
            saveStatusEl.classList.remove('text-blue-500', 'text-green-600');
            saveStatusEl.classList.add('text-red-500');
        }
    }
}

// =================================================================================
// FUNÇÕES DE EXPORTAÇÃO
// =================================================================================

function exportToMarkdown() {
    if (!activePageId) {
        showModal('Atenção', 'Por favor, selecione uma página para exportar.', { showCancelButton: false, confirmText: 'OK' });
        return;
    }
    const turndownService = new TurndownService();
    const completeHtml = `<h1>${currentPageTitle.textContent}</h1>${pageContent.innerHTML}`;
    const markdown = turndownService.turndown(completeHtml);
    
    const pageName = currentPageTitle.textContent || 'documento';
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${pageName.replace(/ /g, '_')}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function exportToPDF() {
    if (!activePageId) {
        showModal('Atenção', 'Por favor, selecione uma página para exportar.', { showCancelButton: false, confirmText: 'OK' });
        return;
    }
    const { jsPDF } = window.jspdf;
    const pageName = currentPageTitle.textContent || 'documento';

    saveStatusEl.textContent = 'A gerar PDF...';
    saveStatusEl.classList.add('text-blue-500');

    html2canvas(pageRenderArea, {
        scale: 2,
        useCORS: true
    }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4'
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const ratio = canvasWidth / canvasHeight;
        
        let imgWidth = pdfWidth;
        let imgHeight = imgWidth / ratio;

        if (imgHeight > pdfHeight) {
            imgHeight = pdfHeight;
            imgWidth = imgHeight * ratio;
        }

        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
        pdf.save(`${pageName.replace(/ /g, '_')}.pdf`);
        
        saveStatusEl.textContent = 'PDF gerado!';
        setTimeout(() => { saveStatusEl.textContent = ''; }, 2000);
    }).catch(err => {
        console.error("Erro ao gerar PDF:", err);
        saveStatusEl.textContent = 'Erro ao gerar PDF!';
        saveStatusEl.classList.add('text-red-500');
    });
}


// =================================================================================
// FUNÇÕES DE RENDERIZAÇÃO E GESTÃO
// =================================================================================

function render() {
    const notebook = userData.notebooks?.[activeNotebookId];
    if (!notebook) {
        window.location.href = 'home.html';
        return;
    }
    const sections = notebook.sections || {};
    if (Object.keys(sections).length > 0 && !sections[activeSectionId]) {
        activeSectionId = Object.keys(sections)[0];
    }
    if (Object.keys(sections).length === 0) activeSectionId = null;

    const activeSection = sections[activeSectionId];
    const pages = activeSection?.pages || {};
    if (Object.keys(pages).length > 0 && !pages[activePageId]) {
        activePageId = Object.keys(pages)[0];
    }
    if (Object.keys(pages).length === 0) activePageId = null;

    renderNotebookName(notebook.name);
    renderSectionsList(sections);
    renderPagesList(pages);
    renderPageContent();
    toggleManagementButtons();
}

function renderNotebookName(name) { activeNotebookNameEl.textContent = name; }

function renderSectionsList(sections) {
    sectionsList.innerHTML = '';
    if (Object.keys(sections).length === 0) {
        sectionsList.innerHTML = `<p class="text-gray-500 p-2 text-sm">Nenhuma sessão.</p>`;
        return;
    }
    for (const sectionId in sections) {
        const div = document.createElement('div');
        div.className = `p-2 rounded-md hover:bg-gray-100 cursor-pointer ${activeSectionId === sectionId ? 'active-item' : ''}`;
        div.textContent = sections[sectionId].name;
        div.dataset.sectionId = sectionId;
        div.addEventListener('click', () => {
            if (activeSectionId !== sectionId) {
                activeSectionId = sectionId;
                activePageId = null;
                render();
            }
        });
        sectionsList.appendChild(div);
    }
}

function renderPagesList(pages) {
    pagesList.innerHTML = '';
    if (!activeSectionId || Object.keys(pages).length === 0) {
        pagesList.innerHTML = `<p class="text-gray-500 p-2 text-sm">Nenhuma página.</p>`;
        return;
    }
    for (const pageId in pages) {
        const div = document.createElement('div');
        div.className = `p-2 rounded-md hover:bg-gray-100 cursor-pointer ${activePageId === pageId ? 'active-item' : ''}`;
        div.textContent = pages[pageId].name;
        div.dataset.pageId = pageId;
        div.addEventListener('click', () => {
            if (activePageId !== pageId) {
                activePageId = pageId;
                render();
            }
        });
        pagesList.appendChild(div);
    }
}

function renderPageContent() {
    const page = userData.notebooks?.[activeNotebookId]?.sections?.[activeSectionId]?.pages?.[activePageId];
    if (page) {
        currentPageTitle.textContent = page.name;
        pageContent.innerHTML = page.content || '';
        pageContent.contentEditable = 'true';
    } else {
        currentPageTitle.textContent = 'Nenhuma página selecionada';
        pageContent.innerHTML = '<p class="text-gray-400">Selecione uma página ou crie uma nova para começar.</p>';
        pageContent.contentEditable = 'false';
    }

    // Atualizar painel de artefatos IA
    updateAiBadges();
}

function toggleManagementButtons() {
    renameNotebookBtn.disabled = false;
    deleteNotebookBtn.disabled = false;
    renameSectionBtn.disabled = !activeSectionId;
    deleteSectionBtn.disabled = !activeSectionId;
    renamePageBtn.disabled = !activePageId;
    deletePageBtn.disabled = !activePageId;
}

function showModal(title, message, options = {}) {
    // Esconde todos os campos customizados antes de mostrar o modal
    const customLabels = document.querySelectorAll('.modal-label');
    const customInputs = document.querySelectorAll('.modal-input-field');
    customLabels.forEach(label => label.classList.add('hidden'));
    customInputs.forEach(input => input.classList.add('hidden'));

    const {
        showInput = false,
        showTextInput = false,
        inputValue = '',
        textInputValue = '',
        textInputPlaceholder = 'Texto a ser exibido',
        urlInputPlaceholder = 'https://...',
        showSpinner = false,
        showButtons = true,
        showCancelButton = true,
        confirmText = 'Confirmar',
        confirmCallback = null
    } = options;

    modalTitle.textContent = title;
    modalMessage.textContent = message;

    const modalInputText = document.getElementById('modal-input-text');
    const modalLabelText = document.getElementById('modal-label-text');
    const modalInputURL = document.getElementById('modal-input');
    const modalLabelURL = document.getElementById('modal-label-url');

    if (showTextInput) {
        modalLabelText.classList.remove('hidden');
        modalInputText.classList.remove('hidden');
        modalInputText.value = textInputValue;
        modalInputText.placeholder = textInputPlaceholder;
    }
    
    if (showInput) {
        modalLabelURL.textContent = showTextInput ? "URL do Link:" : "Novo nome:";
        modalLabelURL.classList.remove('hidden');
        modalInputURL.classList.remove('hidden');
        modalInputURL.value = inputValue;
        modalInputURL.placeholder = urlInputPlaceholder;
    }
    
    modalSpinner.classList.toggle('hidden', !showSpinner);
    modalButtons.classList.toggle('hidden', !showButtons);
    modalCancelBtn.classList.toggle('hidden', !showCancelButton);
    
    modalConfirmBtn.textContent = confirmText;
    
    confirmationModal.classList.remove('hidden');
    modalConfirmCallback = (result) => {
        if (options.confirmCallback) {
            options.confirmCallback(result);
        }
    };

    if (showInput) modalInputURL.focus();
}

function hideModal() {
    confirmationModal.classList.add('hidden');
    modalConfirmCallback = null;
}

function renderSummariesList() {
    if (!activePageId) return;
    const page = userData.notebooks[activeNotebookId].sections[activeSectionId].pages[activePageId];
    summariesListContainer.innerHTML = '';

    if (!page.summaries || page.summaries.length === 0) {
        summariesListContainer.innerHTML = '<p class="text-gray-500">Nenhum resumo salvo para esta página.</p>';
        return;
    }

    const sortedSummaries = [...page.summaries].sort((a, b) => b.createdAt - a.createdAt);

    sortedSummaries.forEach(summaryData => {
        const summaryEl = document.createElement('div');
        summaryEl.className = 'border-b border-gray-200 py-4';

        const formattedDate = new Date(summaryData.createdAt).toLocaleString('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short'
        });

        summaryEl.innerHTML = `
            <p class="text-xs text-gray-500 mb-2">Gerado em: ${formattedDate}</p>
            <p class="text-gray-800 whitespace-pre-wrap">${summaryData.summaryText}</p>
            <details class="mt-3 text-sm">
                <summary class="cursor-pointer text-blue-600 hover:underline">Mostrar texto original</summary>
                <blockquote class="mt-2 p-3 bg-gray-50 border-l-4 border-gray-300 text-gray-600 italic">
                    ${summaryData.originalText}
                </blockquote>
            </details>
        `;
        summariesListContainer.appendChild(summaryEl);
    });
}

function markdownListToHtml(markdown) {
    const lines = markdown.split('\n').filter(line => line.trim() !== '');
    let html = '<ul>';
    let level = 0;

    lines.forEach(line => {
        const trimmedLine = line.trim();
        const currentLevel = (line.match(/^\s*/)[0].length) / 2;
        const content = trimmedLine.replace(/^- \s*/, '');

        if (currentLevel > level) {
            html += '<ul>'.repeat(currentLevel - level);
        } else if (currentLevel < level) {
            html += '</li></ul>'.repeat(level - currentLevel) + '</li>';
        } else if (level > 0 && !html.endsWith('</li>')) {
             html += '</li>';
        }

        html += `<li>${content}`;
        level = currentLevel;
    });

    html += '</li></ul>'.repeat(level + 1);
    return html.replace(/<\/li><\/ul><\/li>/g, '</li></ul>');
}


// =================================================================================
// FUNÇÕES DO PAINEL DE ARTEFATOS IA
// =================================================================================

/**
 * Abre o painel de artefatos IA
 */
function openAiPanel() {
    if (aiPanel) {
        aiPanel.classList.remove('hidden');
        updateAiPanelContent(); // Atualiza o conteúdo ao abrir
    }
}

/**
 * Fecha o painel de artefatos IA
 */
function closeAiPanel() {
    if (aiPanel) {
        aiPanel.classList.add('hidden');
    }
}

/**
 * Alterna (abre/fecha) o painel de artefatos IA
 */
function toggleAiPanel() {
    if (aiPanel.classList.contains('hidden')) {
        openAiPanel();
    } else {
        closeAiPanel();
    }
}

/**
 * Troca entre as abas do painel (Resumos / Mapas Mentais)
 * @param {string} tabName - Nome da aba ('summaries' ou 'mindmaps')
 */
function switchAiTab(tabName) {
    // Remove 'active' de todas as abas
    const allTabs = document.querySelectorAll('.ai-tab');
    const allTabContents = document.querySelectorAll('.ai-tab-content');

    allTabs.forEach(tab => tab.classList.remove('active'));
    allTabContents.forEach(content => content.classList.remove('active'));

    // Adiciona 'active' na aba e conteúdo selecionados
    if (tabName === 'summaries') {
        tabSummaries.classList.add('active');
        aiSummariesContent.classList.add('active');
    } else if (tabName === 'mindmaps') {
        tabMindmaps.classList.add('active');
        aiMindmapsContent.classList.add('active');
    }
}

/**
 * Atualiza os badges (contadores) do painel
 */
function updateAiBadges() {
    if (!activePageId) {
        // Sem página ativa, zerar badges
        summariesBadge.textContent = '0';
        mindmapsBadge.textContent = '0';
        totalArtifactsBadge.textContent = '0';
        totalArtifactsBadge.classList.add('hidden');
        return;
    }

    const page = userData.notebooks?.[activeNotebookId]?.sections?.[activeSectionId]?.pages?.[activePageId];

    if (!page) {
        summariesBadge.textContent = '0';
        mindmapsBadge.textContent = '0';
        totalArtifactsBadge.textContent = '0';
        totalArtifactsBadge.classList.add('hidden');
        return;
    }

    const summariesCount = (page.summaries && page.summaries.length) || 0;
    const mindmapsCount = (page.mindMaps && page.mindMaps.length) || 0;
    const totalCount = summariesCount + mindmapsCount;

    // Atualizar badges
    summariesBadge.textContent = summariesCount;
    mindmapsBadge.textContent = mindmapsCount;
    totalArtifactsBadge.textContent = totalCount;

    // Mostrar/esconder badge do botão flutuante
    if (totalCount > 0) {
        totalArtifactsBadge.classList.remove('hidden');
    } else {
        totalArtifactsBadge.classList.add('hidden');
    }
}

/**
 * Atualiza o conteúdo do painel com os artefatos da página atual
 */
function updateAiPanelContent() {
    updateAiBadges();

    if (!activePageId) {
        aiSummariesContent.innerHTML = '<p class="text-gray-500 text-center py-8">Selecione uma página primeiro.</p>';
        aiMindmapsContent.innerHTML = '<p class="text-gray-500 text-center py-8">Selecione uma página primeiro.</p>';
        return;
    }

    const page = userData.notebooks?.[activeNotebookId]?.sections?.[activeSectionId]?.pages?.[activePageId];

    if (!page) return;

    // === RESUMOS ===
    if (!page.summaries || page.summaries.length === 0) {
        aiSummariesContent.innerHTML = '<p class="text-gray-500 text-center py-8">Nenhum resumo gerado ainda.</p>';
    } else {
        const sortedSummaries = [...page.summaries].sort((a, b) => b.createdAt - a.createdAt);
        let htmlSummaries = '';

        sortedSummaries.forEach((summary, index) => {
            const formattedDate = new Date(summary.createdAt).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short'
            });
            const cardId = `summary-${summary.createdAt}`;

            htmlSummaries += `
                <div class="artifact-card collapsed mb-3" data-card-id="${cardId}">
                    <div class="artifact-header" onclick="toggleArtifactCard('${cardId}')">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-file-alt text-blue-600"></i>
                            <span class="font-semibold text-gray-800">Resumo #${sortedSummaries.length - index}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-xs text-gray-500">${formattedDate}</span>
                            <i class="fas fa-chevron-down artifact-toggle-icon text-gray-400"></i>
                        </div>
                    </div>
                    <div class="artifact-content">
                        <p class="text-gray-800 text-sm whitespace-pre-wrap">${summary.summaryText}</p>
                    </div>
                </div>
            `;
        });

        aiSummariesContent.innerHTML = htmlSummaries;
    }

    // === MAPAS MENTAIS ===
    if (!page.mindMaps || page.mindMaps.length === 0) {
        aiMindmapsContent.innerHTML = '<p class="text-gray-500 text-center py-8">Nenhum mapa mental gerado ainda.</p>';
    } else {
        const sortedMindMaps = [...page.mindMaps].sort((a, b) => b.createdAt - a.createdAt);
        let htmlMindMaps = '';

        sortedMindMaps.forEach((mindMap, index) => {
            const formattedDate = new Date(mindMap.createdAt).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short'
            });
            const cardId = `mindmap-${mindMap.createdAt}`;

            htmlMindMaps += `
                <div class="artifact-card collapsed mb-3" data-card-id="${cardId}">
                    <div class="artifact-header" onclick="toggleArtifactCard('${cardId}')">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-sitemap text-purple-600"></i>
                            <span class="font-semibold text-gray-800">Mapa Mental #${sortedMindMaps.length - index}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-xs text-gray-500">${formattedDate}</span>
                            <i class="fas fa-chevron-down artifact-toggle-icon text-gray-400"></i>
                        </div>
                    </div>
                    <div class="artifact-content">
                        <div class="text-sm text-gray-800 bg-white p-3 rounded border border-purple-200">
                            ${markdownListToHtml(mindMap.mapData)}
                        </div>
                    </div>
                </div>
            `;
        });

        aiMindmapsContent.innerHTML = htmlMindMaps;
    }
}

/**
 * Alterna o estado expandido/colapsado de um card de artefato
 * @param {string} cardId - ID único do card
 */
function toggleArtifactCard(cardId) {
    const card = document.querySelector(`[data-card-id="${cardId}"]`);
    if (!card) return;

    // Alterna a classe 'collapsed'
    card.classList.toggle('collapsed');
}

// Tornar a função global para ser acessível via onclick no HTML
window.toggleArtifactCard = toggleArtifactCard;


// =================================================================================
// EVENT LISTENERS ORIGINAIS (PERMANECEM AQUI)
// =================================================================================

if (exportMdBtn) exportMdBtn.addEventListener('click', exportToMarkdown);
if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportToPDF);

// ADIÇÃO DO LISTENER DO MODO NOTURNO
if (darkModeToggleBtn) {
    darkModeToggleBtn.addEventListener('click', toggleDarkMode);
}
// FIM DA ADIÇÃO

if (summariesModalCloseBtn) {
    summariesModalCloseBtn.addEventListener('click', () => {
        summariesModal.classList.add('hidden');
    });
}

if (mindMapBtn) {
    mindMapBtn.addEventListener('click', () => {
        const selectedText = window.getSelection().toString().trim();
        if (selectedText) {
            showModal('Gerando Mapa Mental', 'Aguarde, estamos organizando as ideias...', { showButtons: false, showSpinner: true });

            generateMindMap({ text: selectedText })
                .then(async (result) => {
                    const mindMapData = result.data.mindMapData;

                    if (activePageId) {
                        const page = userData.notebooks[activeNotebookId].sections[activeSectionId].pages[activePageId];
                        if (!page.mindMaps) page.mindMaps = [];
                        page.mindMaps.push({
                            createdAt: Date.now(),
                            originalText: selectedText,
                            mapData: mindMapData
                        });
                        await saveChanges();
                        updateAiBadges(); // Atualizar badges após salvar
                    }

                    hideModal();
                    mindMapContainer.innerHTML = markdownListToHtml(mindMapData);
                    mindMapModal.classList.remove('hidden');
                })
                .catch((error) => {
                    hideModal();
                    showModal('Erro', 'Não foi possível gerar o mapa mental.', { showCancelButton: false, confirmText: 'Fechar' });
                });
        }
        customContextMenu.classList.add('hidden');
    });
}

if (mindMapModalCloseBtn) {
    mindMapModalCloseBtn.addEventListener('click', () => {
        mindMapModal.classList.add('hidden');
    });
}

// =================================================================================
// EVENT LISTENERS DO PAINEL DE ARTEFATOS IA
// =================================================================================

// Botão flutuante para abrir o painel
if (toggleAiPanelBtn) {
    toggleAiPanelBtn.addEventListener('click', () => {
        toggleAiPanel();
    });
}

// Botão X para fechar o painel
if (closeAiPanelBtn) {
    closeAiPanelBtn.addEventListener('click', () => {
        closeAiPanel();
    });
}

// Aba de Resumos
if (tabSummaries) {
    tabSummaries.addEventListener('click', () => {
        switchAiTab('summaries');
    });
}

// Aba de Mapas Mentais
if (tabMindmaps) {
    tabMindmaps.addEventListener('click', () => {
        switchAiTab('mindmaps');
    });
}

// =================================================================================

addSectionBtn.addEventListener('click', () => {
    showModal('Criar Nova Sessão', 'Qual será o nome da nova sessão?', {
        showInput: true,
        confirmCallback: async (name) => {
            if (name && name.trim() !== "") {
                const id = `section-${Date.now()}`;
                const notebook = userData.notebooks[activeNotebookId];
                if (!notebook.sections) notebook.sections = {};
                notebook.sections[id] = { name: name.trim(), pages: {} };
                activeSectionId = id;
                activePageId = null;
                notebook.lastModified = Date.now();
                await saveChanges();
                render();
            }
        }
    });
});

addPageBtn.addEventListener('click', () => {
    if (!activeSectionId) {
        showModal('Atenção', 'Por favor, selecione uma sessão antes de adicionar uma página.', { showCancelButton: false, confirmText: 'OK' });
        return;
    }
    showModal('Criar Nova Página', 'Qual será o nome da nova página?', {
        showInput: true,
        confirmCallback: async (name) => {
            if (name && name.trim() !== "") {
                const id = `page-${Date.now()}`;
                const section = userData.notebooks[activeNotebookId].sections[activeSectionId];
                if (!section.pages) section.pages = {};
                section.pages[id] = { name: name.trim(), content: '', summaries: [], mindMaps: [] };
                activePageId = id;
                userData.notebooks[activeNotebookId].lastModified = Date.now();
                await saveChanges();
                render();
            }
        }
    });
});

renameNotebookBtn.addEventListener('click', () => {
    const currentName = userData.notebooks[activeNotebookId].name;
    showModal('Renomear Caderno', '', {
        showInput: true,
        inputValue: currentName,
        confirmCallback: async (newName) => {
            if (newName && newName.trim() !== "" && newName.trim() !== currentName) {
                userData.notebooks[activeNotebookId].name = newName.trim();
                userData.notebooks[activeNotebookId].lastModified = Date.now();
                await saveChanges();
                renderNotebookName(newName.trim());
            }
        }
    });
});

deleteNotebookBtn.addEventListener('click', () => {
    const notebookName = userData.notebooks[activeNotebookId].name;
    showModal('Excluir Caderno', `Tem a certeza que deseja excluir o caderno "${notebookName}" e todo o seu conteúdo?`, {
        confirmCallback: async (confirm) => {
            if (confirm) {
                delete userData.notebooks[activeNotebookId];
                await saveChanges();
                window.location.href = 'home.html';
            }
        }
    });
});

renameSectionBtn.addEventListener('click', () => {
    if (!activeSectionId) return;
    const currentName = userData.notebooks[activeNotebookId].sections[activeSectionId].name;
    showModal('Renomear Sessão', '', {
        showInput: true,
        inputValue: currentName,
        confirmCallback: async (newName) => {
            if (newName && newName.trim() !== "" && newName.trim() !== currentName) {
                userData.notebooks[activeNotebookId].sections[activeSectionId].name = newName.trim();
                userData.notebooks[activeNotebookId].lastModified = Date.now();
                await saveChanges();
                render();
            }
        }
    });
});

deleteSectionBtn.addEventListener('click', () => {
    if (!activeSectionId) return;
    const sectionName = userData.notebooks[activeNotebookId].sections[activeSectionId].name;
    showModal('Excluir Sessão', `Tem a certeza que deseja excluir a sessão "${sectionName}" e todas as suas páginas?`, {
        confirmCallback: async (confirm) => {
            if (confirm) {
                delete userData.notebooks[activeNotebookId].sections[activeSectionId];
                userData.notebooks[activeNotebookId].lastModified = Date.now();
                const remainingSectionIds = Object.keys(userData.notebooks[activeNotebookId].sections);
                activeSectionId = remainingSectionIds.length > 0 ? remainingSectionIds[0] : null;
                activePageId = null;
                await saveChanges();
                render();
            }
        }
    });
});

renamePageBtn.addEventListener('click', () => {
    if (!activePageId) return;
    const currentPageName = userData.notebooks[activeNotebookId].sections[activeSectionId].pages[activePageId].name;
    showModal('Renomear Página', '', {
        showInput: true,
        inputValue: currentPageName,
        confirmCallback: async (newName) => {
            if (newName && newName.trim() !== "" && newName.trim() !== currentPageName) {
                userData.notebooks[activeNotebookId].sections[activeSectionId].pages[activePageId].name = newName.trim();
                userData.notebooks[activeNotebookId].lastModified = Date.now();
                await saveChanges();
                render();
            }
        }
    });
});

deletePageBtn.addEventListener('click', () => {
    if (!activePageId) return;
    const pageName = userData.notebooks[activeNotebookId].sections[activeSectionId].pages[activePageId].name;
    showModal('Excluir Página', `Tem a certeza que deseja excluir a página "${pageName}"?`, {
        confirmCallback: async (confirm) => {
            if (confirm) {
                delete userData.notebooks[activeNotebookId].sections[activeSectionId].pages[activePageId];
                userData.notebooks[activeNotebookId].lastModified = Date.now();
                const remainingPageIds = Object.keys(userData.notebooks[activeNotebookId].sections[activeSectionId].pages);
                activePageId = remainingPageIds.length > 0 ? remainingPageIds[0] : null;
                await saveChanges();
                render();
            }
        }
    });
});

pageContent.addEventListener('input', () => {
    clearTimeout(saveTimeout);
    if (saveStatusEl) {
        saveStatusEl.textContent = 'A digitar...';
        saveStatusEl.classList.remove('text-green-600', 'text-red-500');
        saveStatusEl.classList.add('text-gray-500');
    }
    saveTimeout = setTimeout(async () => {
        if (!activePageId || !activeSectionId || !activeNotebookId) return;
        const page = userData.notebooks[activeNotebookId].sections[activeSectionId].pages[activePageId];
        if (page.content !== pageContent.innerHTML) {
            page.content = pageContent.innerHTML;
            userData.notebooks[activeNotebookId].lastModified = Date.now();
            await saveChanges();
        } else {
            if (saveStatusEl) {
                saveStatusEl.textContent = 'Salvo!';
                saveStatusEl.classList.remove('text-gray-500');
                saveStatusEl.classList.add('text-green-600');
                setTimeout(() => { saveStatusEl.textContent = ''; }, 2000);
            }
        }
    }, 1500);
});

modalConfirmBtn.addEventListener('click', () => {
    if (modalConfirmCallback) {
        // Para o modal de link, passamos um objeto com os dois valores
        if (document.getElementById('modal-input-text') && !document.getElementById('modal-input-text').classList.contains('hidden')) {
            const result = {
                text: document.getElementById('modal-input-text').value,
                url: document.getElementById('modal-input').value
            };
            modalConfirmCallback(result);
        } else { // Comportamento antigo para outros modais
            const inputValue = modalInput.classList.contains('hidden') ? true : modalInput.value;
            modalConfirmCallback(inputValue);
        }
    }
    hideModal();
});

modalCancelBtn.addEventListener('click', hideModal);

document.execCommand('defaultParagraphSeparator', false, 'p');

if (boldBtn) boldBtn.addEventListener('click', () => document.execCommand('bold'));
if (italicBtn) italicBtn.addEventListener('click', () => document.execCommand('italic'));
if (underlineBtn) underlineBtn.addEventListener('click', () => document.execCommand('underline'));
if (strikethroughBtn) strikethroughBtn.addEventListener('click', () => document.execCommand('strikeThrough'));

if (headingSelect) {
    headingSelect.addEventListener('change', () => {
        document.execCommand('formatBlock', false, headingSelect.value);
        pageContent.focus();
    });
}

if (alignLeftBtn) alignLeftBtn.addEventListener('click', () => document.execCommand('justifyLeft'));
if (alignCenterBtn) alignCenterBtn.addEventListener('click', () => document.execCommand('justifyCenter'));
if (alignRightBtn) alignRightBtn.addEventListener('click', () => document.execCommand('justifyRight'));
if (alignJustifyBtn) alignJustifyBtn.addEventListener('click', () => document.execCommand('justifyFull'));

if (ulBtn) ulBtn.addEventListener('click', () => {
        // restore selection saved on mousedown (if any)
        const sel = window.getSelection();
        if (lastEditorSelection) {
            sel.removeAllRanges();
            sel.addRange(lastEditorSelection);
            lastEditorSelection = null;
        }
        pageContent.focus();
        setTimeout(() => {
            document.execCommand('insertUnorderedList');
            setTimeout(() => {
                const sel2 = window.getSelection();
                if (!sel2.rangeCount) return;
                let node = sel2.getRangeAt(0).commonAncestorContainer;
                if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

                // Se execCommand não criou <ul>, usa insertHTML como fallback
                if (!node || (node && !node.closest('ul'))) {
                    try {
                        const range = sel2.getRangeAt(0).cloneRange();
                        if (range.collapsed) {
                            // Insere uma lista vazia
                            document.execCommand('insertHTML', false, '<ul><li><br></li></ul>');
                        } else {
                            const fragment = range.cloneContents();
                            const div = document.createElement('div');
                            div.appendChild(fragment);
                            const html = '<ul><li>' + div.innerHTML + '</li></ul>';
                            document.execCommand('insertHTML', false, html);
                        }
                    } catch (e) { /* ignore */ }
                }
            }, 20);
        }, 0);
    });

    if (olBtn) olBtn.addEventListener('click', () => {
        const sel = window.getSelection();
        if (lastEditorSelection) {
            sel.removeAllRanges();
            sel.addRange(lastEditorSelection);
            lastEditorSelection = null;
        }
        pageContent.focus();
        setTimeout(() => {
            document.execCommand('insertOrderedList');
            setTimeout(() => {
                const sel2 = window.getSelection();
                if (!sel2.rangeCount) return;
                let node = sel2.getRangeAt(0).commonAncestorContainer;
                if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

                if (!node || (node && !node.closest('ol'))) {
                    try {
                        const range = sel2.getRangeAt(0).cloneRange();
                        if (range.collapsed) {
                            document.execCommand('insertHTML', false, '<ol><li><br></li></ol>');
                        } else {
                            const fragment = range.cloneContents();
                            const div = document.createElement('div');
                            div.appendChild(fragment);
                            const html = '<ol><li>' + div.innerHTML + '</li></ol>';
                            document.execCommand('insertHTML', false, html);
                        }
                    } catch (e) { /* ignore */ }
                }
            }, 20);
        }, 0);
    });

if (removeFormatBtn) removeFormatBtn.addEventListener('click', () => document.execCommand('removeFormat'));

if (fontFamilySelect) {
    fontFamilySelect.addEventListener('change', () => {
        document.execCommand('fontName', false, fontFamilySelect.value);
        pageContent.focus();
    });
}

if (fontSizeSelect) {
    fontSizeSelect.addEventListener('change', () => {
        document.execCommand('fontSize', false, fontSizeSelect.value);
        pageContent.focus();
    });
}

// --- Lógica para o Resumo com Gemini ---
pageContent.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const selectedText = window.getSelection().toString().trim();
    if (selectedText.length > 20) {
        customContextMenu.style.top = `${event.pageY}px`;
        customContextMenu.style.left = `${event.pageX}px`;
        customContextMenu.classList.remove('hidden');
    }
});

summarizeBtn.addEventListener('click', () => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
        showModal('Gerando Resumo', 'Aguarde, estamos processando o seu texto...', { showButtons: false, showSpinner: true });
        summarizeText({ text: selectedText })
            .then(async (result) => {
                const summary = result.data.summary;
                if (activePageId) {
                    const page = userData.notebooks[activeNotebookId].sections[activeSectionId].pages[activePageId];
                    if (!page.summaries) {
                        page.summaries = [];
                    }
                    page.summaries.push({
                        createdAt: Date.now(),
                        originalText: selectedText,
                        summaryText: summary
                    });
                    await saveChanges();
                    renderPageContent();
                    updateAiBadges(); // Atualizar badges após salvar
                }
                hideModal();
                showModal('Resumo Gerado pela IA', summary, { 
                    showCancelButton: false, 
                    confirmText: 'Fechar',
                    confirmCallback: hideModal 
                });
            })
            .catch((error) => {
                hideModal();
                showModal('Erro', 'Não foi possível gerar o resumo. Tente novamente.', { 
                    showCancelButton: false, 
                    confirmText: 'Fechar',
                    confirmCallback: hideModal 
                });
            });
    }
    customContextMenu.classList.add('hidden');
});

document.addEventListener('click', (e) => {
    if (customContextMenu && !customContextMenu.contains(e.target)) {
        customContextMenu.classList.add('hidden');
    }
});


// =================================================================================
// INÍCIO: NOVAS FUNCIONALIDADES DO EDITOR DE TEXTO (VERSÃO ROBUSTA)
// =================================================================================
document.addEventListener('DOMContentLoaded', function() {
    
    // --- 1. CAPTURA DE ELEMENTOS DO EDITOR ---
    const allToolbarButtons = {
        undoBtn: document.getElementById('undo-btn'),
        redoBtn: document.getElementById('redo-btn'),
        formatPainterBtn: document.getElementById('format-painter-btn'),
        boldBtn: document.getElementById('bold-btn'),
        italicBtn: document.getElementById('italic-btn'),
        underlineBtn: document.getElementById('underline-btn'),
        strikethroughBtn: document.getElementById('strikethrough-btn'),
        textColorBtn: document.getElementById('text-color-btn'),
        highlightColorBtn: document.getElementById('highlight-color-btn'),
        // linkBtn removed temporarily
        alignLeftBtn: document.getElementById('align-left-btn'),
        alignCenterBtn: document.getElementById('align-center-btn'),
        alignRightBtn: document.getElementById('align-right-btn'),
        alignJustifyBtn: document.getElementById('align-justify-btn'),
        ulBtn: document.getElementById('ul-btn'),
        olBtn: document.getElementById('ol-btn'),
        outdentBtn: document.getElementById('outdent-btn'),
        indentBtn: document.getElementById('indent-btn'),
        blockquoteBtn: document.getElementById('blockquote-btn'),
        removeFormatBtn: document.getElementById('remove-format-btn'),
        textColorPalette: document.getElementById('text-color-palette'),
        highlightColorPalette: document.getElementById('highlight-color-palette'),
        textColorPreview: document.getElementById('text-color-preview'),
        highlightColorPreview: document.getElementById('highlight-color-preview')
    };

    // Save/restore selection helper for toolbar clicks (prevents losing selection when toolbar is clicked)
    const saveSelectionForToolbar = (btn) => {
        if (!btn) return;
        btn.addEventListener('mousedown', (e) => {
            try {
                const sel = window.getSelection();
                lastEditorSelection = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
            } catch (err) {
                lastEditorSelection = null;
            }
        });
    };

    // Attach to buttons that need selection to be preserved
    saveSelectionForToolbar(allToolbarButtons.ulBtn);
    saveSelectionForToolbar(allToolbarButtons.olBtn);
    // link button temporarily removed

    // --- 2. LÓGICA DAS PALETAS DE CORES ---
    const textColors = ['#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#FFFFFF', '#3B82F6', '#E06666', '#F6B26B', '#FFD966', '#93C47D', '#8E7CC3'];
    const highlightColors = ['#FFF2CC', '#D9EAD3', '#CFE2F3', '#F4CCCC', '#EAD1DC', 'transparent'];

    function populateColorPalette(paletteElement, colors, command) {
        if (!paletteElement) return;
        paletteElement.innerHTML = '';
        colors.forEach(color => {
            const swatch = document.createElement('button');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            swatch.dataset.color = color;

            if (color === 'transparent') {
                swatch.style.backgroundImage = `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' stroke='%239CA3AFFF' stroke-width='1' stroke-dasharray='3%2c 3' stroke-linecap='square'/%3e%3c/svg%3e")`;
                swatch.title = "Sem Destaque";
            }
            
            swatch.addEventListener('click', (e) => {
                e.preventDefault();
                const selectedColor = e.target.dataset.color;
                document.execCommand(command, false, selectedColor);
                
                if (command === 'foreColor' && allToolbarButtons.textColorPreview) {
                    allToolbarButtons.textColorPreview.style.backgroundColor = selectedColor;
                } else if ((command === 'backColor' || command === 'hiliteColor') && allToolbarButtons.highlightColorPreview) {
                    allToolbarButtons.highlightColorPreview.style.backgroundColor = selectedColor;
                }
                
                paletteElement.classList.add('hidden');
                pageContent.focus();
            });
            paletteElement.appendChild(swatch);
        });
    }

    populateColorPalette(allToolbarButtons.textColorPalette, textColors, 'foreColor');
    populateColorPalette(allToolbarButtons.highlightColorPalette, highlightColors, 'backColor');

    if (allToolbarButtons.textColorBtn) {
        allToolbarButtons.textColorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            allToolbarButtons.highlightColorPalette.classList.add('hidden');
            allToolbarButtons.textColorPalette.classList.toggle('hidden');
        });
    }

    if (allToolbarButtons.highlightColorBtn) {
        allToolbarButtons.highlightColorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            allToolbarButtons.textColorPalette.classList.add('hidden');
            allToolbarButtons.highlightColorPalette.classList.toggle('hidden');
        });
    }
    
    // --- 3. LÓGICA DO PINCEL DE FORMATAÇÃO (REVISADA E ESTÁVEL) ---
    let formatPainterActive = false;
    let copiedStyles = null; // Guardará pares { 'css-property-name': 'value' }

    // Lista em kebab-case — usaremos getPropertyValue e style.setProperty para maior compatibilidade
    const relevantStyles = [
        'color', 'background-color', 'font-family', 'font-size', 'font-weight',
        'font-style', 'text-decoration', 'text-decoration-color', 'vertical-align'
    ];

    const INLINE_TAGS = ['SPAN','A','B','I','EM','STRONG','U','S','MARK','FONT'];

    if (allToolbarButtons.formatPainterBtn) {
        allToolbarButtons.formatPainterBtn.addEventListener('click', () => {
            // Se já ativo, desativa e limpa o estado
            if (formatPainterActive) {
                formatPainterActive = false;
                copiedStyles = null;
                allToolbarButtons.formatPainterBtn.classList.remove('btn-active');
                pageContent.style.cursor = 'text';
                return;
            }

            const selection = window.getSelection();
            if (!selection || !selection.rangeCount || selection.isCollapsed) {
                showModal('Atenção', 'Para copiar a formatação, selecione primeiro o texto de origem e depois clique no pincel.', { showCancelButton: false, confirmText: 'OK' });
                return;
            }

            // Encontra o elemento de origem mais apropriado (preferir inline)
            let sourceElement = selection.getRangeAt(0).commonAncestorContainer;
            if (sourceElement.nodeType === Node.TEXT_NODE) sourceElement = sourceElement.parentNode;

            // Sobe na árvore até encontrar um elemento inline ou até o container do editor
            while (sourceElement && sourceElement !== pageContent && (
                sourceElement.nodeType !== Node.ELEMENT_NODE ||
                (window.getComputedStyle(sourceElement).display && window.getComputedStyle(sourceElement).display === 'block') ) ) {
                sourceElement = sourceElement.parentNode;
            }

            if (!sourceElement || sourceElement === pageContent) {
                // fallback: tenta usar o parent immediato da selection.anchorNode
                const alt = selection.anchorNode && selection.anchorNode.parentNode;
                if (alt && alt !== pageContent) sourceElement = alt;
            }

            if (!sourceElement || sourceElement === pageContent) {
                showModal('Atenção', 'Não foi possível identificar um elemento de origem para copiar estilos.', { showCancelButton: false, confirmText: 'OK' });
                return;
            }

            const computedStyle = window.getComputedStyle(sourceElement);
            copiedStyles = {};

            for (const prop of relevantStyles) {
                try {
                    const value = computedStyle.getPropertyValue(prop);
                    if (value) copiedStyles[prop] = value.trim();
                } catch (e) {
                    // ignore propriedades que não existam
                }
            }

            // Se nada foi copiado, aborta
            if (!Object.keys(copiedStyles).length) {
                showModal('Atenção', 'Nenhum estilo aplicável foi encontrado na seleção de origem.', { showCancelButton: false, confirmText: 'OK' });
                copiedStyles = null;
                return;
            }

            formatPainterActive = true;
            allToolbarButtons.formatPainterBtn.classList.add('btn-active');
            pageContent.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M18.5,1.15a3.36,3.36,0,0,0-2.38.97L4.6,13.62a1.25,1.25,0,0,0-.35.84V17.5a1.25,1.25,0,0,0,1.25,1.25H8.54a1.25,1.25,0,0,0,.84-.35L20.88,6.88a3.36,3.36,0,0,0,0-4.76,3.36,3.36,0,0,0-2.38-.97ZM8.12,17H6.5V15.38L15.62,6.25l1.63,1.63Zm11-11L17.5,7.62,15.88,6,17.5,4.38a1.86,1.86,0,0,1,2.63,0,1.86,1.86,0,0,1,0,2.63Z"/></svg>'), auto`;
        });
    }

    if (pageContent) {
        pageContent.addEventListener('mouseup', () => {
            const selection = window.getSelection();
            if (!formatPainterActive || !copiedStyles || !selection || !selection.rangeCount || selection.isCollapsed) {
                return;
            }

            try {
                pageContent.focus();
                const range = selection.getRangeAt(0);

                // Extrai o conteúdo selecionado para um DocumentFragment
                const extracted = range.extractContents();

                // Função que aplica os estilos copiados a um elemento
                const applyStyles = (el) => {
                    for (const prop in copiedStyles) {
                        try { el.style.setProperty(prop, copiedStyles[prop]); } catch (e) { /* ignore */ }
                    }
                };

                // Função recursiva que processa um nó do fragmento e retorna um nó estilizado
                function processNode(node) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const span = document.createElement('span');
                        applyStyles(span);
                        span.textContent = node.textContent;
                        return span;
                    }

                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const nodename = node.nodeName;
                        const display = window.getComputedStyle(node).display || '';

                        // Mantemos elementos de bloco (p, div, headings, li, table) e processamos seus filhos
                        if (display === 'block' || ['P','DIV','H1','H2','H3','H4','H5','H6','LI','TABLE'].includes(nodename)) {
                            const newBlock = node.cloneNode(false);
                            // preserva atributos importantes (id, class, etc.)
                            for (const attr of Array.from(node.attributes || [])) {
                                try { newBlock.setAttribute(attr.name, attr.value); } catch(e) { /* ignore */ }
                            }
                            // processa filhos mantendo estrutura de bloco
                            for (const child of Array.from(node.childNodes)) {
                                newBlock.appendChild(processNode(child));
                            }
                            return newBlock;
                        }

                        // Para elementos inline: criamos um clone leve, aplicamos estilos e processamos filhos
                        const newInline = node.cloneNode(false);
                        // copia atributos exceto style para evitar sobrescrever
                        for (const attr of Array.from(node.attributes || [])) {
                            if (attr.name.toLowerCase() !== 'style') {
                                try { newInline.setAttribute(attr.name, attr.value); } catch(e) { /* ignore */ }
                            }
                        }
                        applyStyles(newInline);
                        for (const child of Array.from(node.childNodes)) {
                            newInline.appendChild(processNode(child));
                        }
                        return newInline;
                    }

                    // Para outros tipos de nós, retorna um clone simples
                    return node.cloneNode(true);
                }

                // Processa todo o fragmento extraído
                const toInsert = document.createDocumentFragment();
                for (const child of Array.from(extracted.childNodes)) {
                    toInsert.appendChild(processNode(child));
                }

                // Insere de volta no documento
                range.insertNode(toInsert);

                // Reposiciona o cursor após o conteúdo inserido
                const newRange = document.createRange();
                // Tenta posicionar logo após o último nó inserido
                const parent = range.startContainer;
                let last = null;
                if (toInsert.lastChild) last = toInsert.lastChild;
                else if (range.startContainer && range.startContainer.childNodes[range.startOffset]) last = range.startContainer.childNodes[range.startOffset];

                if (last) {
                    try { newRange.setStartAfter(last); } catch(e) { newRange.selectNodeContents(pageContent); newRange.collapse(false); }
                } else {
                    newRange.selectNodeContents(pageContent);
                    newRange.collapse();
                }

                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);

            } catch (e) {
                console.error('Erro ao aplicar formatação com o pincel:', e);
            } finally {
                formatPainterActive = false;
                copiedStyles = null;
                if (allToolbarButtons.formatPainterBtn) allToolbarButtons.formatPainterBtn.classList.remove('btn-active');
                pageContent.style.cursor = 'text';
            }
        });
    }


    // --- 4. NOVOS LISTENERS DE FORMATAÇÃO ---
    if(allToolbarButtons.undoBtn) allToolbarButtons.undoBtn.addEventListener('click', () => document.execCommand('undo'));
    if(allToolbarButtons.redoBtn) allToolbarButtons.redoBtn.addEventListener('click', () => document.execCommand('redo'));
    if(allToolbarButtons.indentBtn) allToolbarButtons.indentBtn.addEventListener('click', () => document.execCommand('indent'));
    if(allToolbarButtons.outdentBtn) allToolbarButtons.outdentBtn.addEventListener('click', () => document.execCommand('outdent'));

    if (allToolbarButtons.blockquoteBtn) {
        allToolbarButtons.blockquoteBtn.addEventListener('click', () => {
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            let parent = selection.getRangeAt(0).commonAncestorContainer;
            if (parent.nodeType !== Node.ELEMENT_NODE) {
                parent = parent.parentNode;
            }
            const isBlockquote = parent.closest('blockquote');
            document.execCommand('formatBlock', false, isBlockquote ? 'p' : 'blockquote');
            pageContent.focus();
        });
    }

    // link button event listener block removed — link feature disabled temporarily

    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const sidebarWrapper = document.getElementById('sidebar-wrapper');
    const toggleIcon = document.getElementById('toggle-icon');

    if (toggleSidebarBtn && sidebarWrapper && toggleIcon) {
        toggleSidebarBtn.addEventListener('click', () => {
            // Adiciona ou remove a classe 'collapsed' nos elementos
            sidebarWrapper.classList.toggle('collapsed');
            toggleSidebarBtn.classList.toggle('collapsed');

            // Verifica se está recolhido para trocar o ícone da seta
            if (sidebarWrapper.classList.contains('collapsed')) {
                toggleIcon.classList.remove('fa-chevron-left');
                toggleIcon.classList.add('fa-chevron-right');
            } else {
                toggleIcon.classList.remove('fa-chevron-right');
                toggleIcon.classList.add('fa-chevron-left');
            }
        });
    }


    // --- 5. LÓGICA OTIMIZADA PARA ATUALIZAR O ESTADO DOS BOTÕES ---
    function updateToolbarState() {
        const toggleButtonActive = (button, command) => {
            if (button) {
                button.classList.toggle('btn-active', document.queryCommandState(command));
            }
        };

        const checkElementState = (button, tagName) => {
            if (!button || window.getSelection().rangeCount === 0) return;
            let container = window.getSelection().getRangeAt(0).commonAncestorContainer;
            if (container.nodeType !== Node.ELEMENT_NODE) {
                container = container.parentNode;
            }
            button.classList.toggle('btn-active', container && container.closest(tagName));
        };

        toggleButtonActive(allToolbarButtons.boldBtn, 'bold');
        toggleButtonActive(allToolbarButtons.italicBtn, 'italic');
        toggleButtonActive(allToolbarButtons.underlineBtn, 'underline');
        toggleButtonActive(allToolbarButtons.strikethroughBtn, 'strikeThrough');
        toggleButtonActive(allToolbarButtons.ulBtn, 'insertUnorderedList');
        toggleButtonActive(allToolbarButtons.olBtn, 'insertOrderedList');
        toggleButtonActive(allToolbarButtons.alignLeftBtn, 'justifyLeft');
        toggleButtonActive(allToolbarButtons.alignCenterBtn, 'justifyCenter');
        toggleButtonActive(allToolbarButtons.alignRightBtn, 'justifyRight');
        toggleButtonActive(allToolbarButtons.alignJustifyBtn, 'justifyFull');
        // link button state check removed
        checkElementState(allToolbarButtons.blockquoteBtn, 'blockquote');
    }

    if (pageContent) {
        let throttleTimeout;
        const throttledUpdate = () => {
            if (!throttleTimeout) {
                throttleTimeout = setTimeout(() => {
                    updateToolbarState();
                    throttleTimeout = null;
                }, 150);
            }
        };
        ['keyup', 'mouseup', 'focus'].forEach(event => pageContent.addEventListener(event, throttledUpdate));
        document.addEventListener('selectionchange', throttledUpdate);
    }
    
    // --- 6. FECHAMENTO DAS PALETAS ---
    document.addEventListener('click', (e) => {
        if (allToolbarButtons.textColorPalette && allToolbarButtons.textColorBtn && !allToolbarButtons.textColorBtn.contains(e.target) && !allToolbarButtons.textColorPalette.contains(e.target)) {
            allToolbarButtons.textColorPalette.classList.add('hidden');
        }
        if (allToolbarButtons.highlightColorPalette && allToolbarButtons.highlightColorBtn && !allToolbarButtons.highlightColorBtn.contains(e.target) && !allToolbarButtons.highlightColorPalette.contains(e.target)) {
            allToolbarButtons.highlightColorPalette.classList.add('hidden');
        }
    });
});
// =================================================================================
// FIM: NOVAS FUNCIONALIDADES DO EDITOR DE TEXTO
// =================================================================================