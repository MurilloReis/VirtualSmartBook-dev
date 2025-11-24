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
    updateAiPanelContent(); // Atualizar painel de artefatos ao mudar de página/seção
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

// Conversor JSON para Markdown (FALLBACK no frontend)
function jsonToMarkdownFallback(data, level = 1) {
    let result = '';
    const hash = '#'.repeat(Math.min(level, 6));

    if (typeof data === 'string' && data.trim()) {
        return `${hash} ${data.trim()}\n`;
    }

    if (Array.isArray(data)) {
        data.forEach(item => result += jsonToMarkdownFallback(item, level));
        return result;
    }

    if (typeof data === 'object' && data !== null) {
        const title = data.central || data.title || data.name || data.topic;
        if (title) result += `${hash} ${String(title).trim()}\n`;

        const arrays = [data.branches, data.children, data.items, data.topics].filter(arr => Array.isArray(arr));
        arrays.forEach(arr => arr.forEach(item => result += jsonToMarkdownFallback(item, level + 1)));
    }

    return result;
}

/**
 * Renderiza um mapa mental interativo usando Markmap
 * @param {string} markdown - Markdown formatado com cabeçalhos (#, ##, ###)
 * @param {HTMLElement} container - Elemento onde o mapa será renderizado
 */
function renderMarkmap(markdown, container) {
    if (!markdown || !container) {
        console.error('Markdown ou container inválido para renderizar Markmap');
        return;
    }

    try {
        let markdownString = markdown;

        // Se recebeu objeto JSON, converte para markdown
        if (typeof markdown === 'object') {
            console.warn('⚠️ Recebeu JSON em vez de markdown, convertendo...');
            markdownString = jsonToMarkdownFallback(markdown);
            console.log('✅ Markdown convertido no frontend:', markdownString);
        }

        markdownString = String(markdownString);

        console.log('Renderizando Markmap com:', markdownString);

        // Limpa o container
        container.innerHTML = '';

        // Garante que o container tenha dimensões
        const containerRect = container.getBoundingClientRect();
        const width = containerRect.width || 800;
        const height = containerRect.height || 400;

        console.log('Dimensões do container:', { width, height });

        // Cria um SVG para o Markmap com dimensões explícitas
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.style.width = width + 'px';
        svg.style.height = height + 'px';
        container.appendChild(svg);

        // Aguarda um frame para garantir que o SVG foi inserido no DOM
        requestAnimationFrame(() => {
            try {
                // Usa a biblioteca Markmap global
                const { Markmap } = window.markmap;
                const { Transformer } = window.markmap;

                // Transforma o markdown em dados para o Markmap
                const transformer = new Transformer();
                const { root } = transformer.transform(markdownString);

                console.log('Root do mapa mental:', root);

                // Renderiza o mapa mental
                Markmap.create(svg, null, root);

                console.log('Markmap renderizado com sucesso!');
            } catch (innerError) {
                console.error('Erro ao criar Markmap:', innerError);
                container.innerHTML = `<div class="text-red-600 p-4">
                    <p class="font-semibold mb-2">Erro ao renderizar mapa mental</p>
                    <p class="text-sm">Detalhes: ${innerError.message}</p>
                </div>`;
            }
        });
    } catch (error) {
        console.error('Erro ao renderizar Markmap:', error);
        container.innerHTML = `<div class="text-red-600 p-4">
            <p class="font-semibold mb-2">Erro ao renderizar mapa mental</p>
            <p class="text-sm">Por favor, tente gerar novamente.</p>
        </div>`;
    }
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
                        <div class="artifact-actions">
                            <button class="artifact-action-btn delete" onclick="event.stopPropagation(); deleteSummary(${summary.createdAt})" title="Excluir resumo">
                                <i class="fas fa-trash"></i>
                            </button>
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

        // Limpa o conteúdo
        aiMindmapsContent.innerHTML = '';

        sortedMindMaps.forEach((mindMap, index) => {
            const formattedDate = new Date(mindMap.createdAt).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short'
            });
            const cardId = `mindmap-${mindMap.createdAt}`;

            // Cria o card simples (sem expansão)
            const card = document.createElement('div');
            card.className = 'artifact-card-simple mb-3';
            card.dataset.cardId = cardId;

            // Armazena os dados do mapa mental no card para acesso posterior
            // Se mapData for objeto, converte para JSON string; se já for string, mantém
            card.dataset.mapData = typeof mindMap.mapData === 'object'
                ? JSON.stringify(mindMap.mapData)
                : mindMap.mapData;

            card.innerHTML = `
                <div class="flex items-center justify-between p-3">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-sitemap text-purple-600 text-lg"></i>
                        <div>
                            <div class="font-semibold text-gray-800">Mapa Mental #${sortedMindMaps.length - index}</div>
                            <div class="text-xs text-gray-500">${formattedDate}</div>
                        </div>
                    </div>
                    <div class="artifact-actions">
                        <button class="artifact-action-btn expand" onclick="expandMindMapByCardId('${cardId}')" title="Visualizar em tela cheia">
                            <i class="fas fa-expand"></i>
                        </button>
                        <button class="artifact-action-btn delete" onclick="deleteMindMap(${mindMap.createdAt})" title="Excluir mapa mental">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;

            aiMindmapsContent.appendChild(card);
        });
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

/**
 * Exclui um resumo da página atual
 * @param {number} createdAt - Timestamp do resumo a ser excluído
 */
function deleteSummary(createdAt) {
    if (!activePageId) return;

    showModal(
        'Confirmar Exclusão',
        'Tem certeza que deseja excluir este resumo?',
        {
            showCancelButton: true,
            confirmText: 'Excluir',
            confirmCallback: async () => {
                try {
                    const page = userData.notebooks[activeNotebookId].sections[activeSectionId].pages[activePageId];

                    // Remove o resumo do array
                    page.summaries = page.summaries.filter(s => s.createdAt !== createdAt);

                    await saveChanges();
                    updateAiPanelContent();
                    updateAiBadges();

                    console.log('✅ Resumo excluído com sucesso');
                    hideModal();
                } catch (error) {
                    console.error('❌ Erro ao excluir resumo:', error);
                    showModal('Erro', 'Não foi possível excluir o resumo.', { showCancelButton: false, confirmText: 'Fechar' });
                }
            }
        }
    );
}

/**
 * Exclui um mapa mental da página atual
 * @param {number} createdAt - Timestamp do mapa mental a ser excluído
 */
function deleteMindMap(createdAt) {
    if (!activePageId) return;

    showModal(
        'Confirmar Exclusão',
        'Tem certeza que deseja excluir este mapa mental?',
        {
            showCancelButton: true,
            confirmText: 'Excluir',
            confirmCallback: async () => {
                try {
                    const page = userData.notebooks[activeNotebookId].sections[activeSectionId].pages[activePageId];

                    // Remove o mapa mental do array
                    page.mindMaps = page.mindMaps.filter(m => m.createdAt !== createdAt);

                    await saveChanges();
                    updateAiPanelContent();
                    updateAiBadges();

                    console.log('✅ Mapa mental excluído com sucesso');
                    hideModal();
                } catch (error) {
                    console.error('❌ Erro ao excluir mapa mental:', error);
                    showModal('Erro', 'Não foi possível excluir o mapa mental.', { showCancelButton: false, confirmText: 'Fechar' });
                }
            }
        }
    );
}

/**
 * Expande um mapa mental em tela cheia
 * @param {string} markdownData - Dados markdown do mapa mental
 */
function expandMindMap(markdownData) {
    const modal = document.getElementById('mindmap-expanded-modal');
    const container = document.getElementById('mindmap-expanded-content-inner');

    if (!modal || !container) {
        console.error('❌ Elementos do modal de expansão não encontrados');
        return;
    }

    // Limpa o container
    container.innerHTML = '';

    // Exibe o modal
    modal.classList.remove('hidden');

    // Aguarda um pouco para garantir que o modal foi renderizado
    setTimeout(() => {
        renderMarkmap(markdownData, container);
    }, 100);
}

/**
 * Fecha o modal de expansão de mapa mental
 */
function closeMindmapExpanded() {
    const modal = document.getElementById('mindmap-expanded-modal');
    if (modal) {
        modal.classList.add('hidden');

        // Limpa o container após fechar
        const container = document.getElementById('mindmap-expanded-content-inner');
        if (container) {
            container.innerHTML = '';
        }
    }
}

/**
 * Expande um mapa mental a partir do ID do card
 * @param {string} cardId - ID do card que contém o mapa mental
 */
function expandMindMapByCardId(cardId) {
    const card = document.querySelector(`[data-card-id="${cardId}"]`);
    if (!card) {
        console.error('❌ Card não encontrado:', cardId);
        return;
    }

    let mapData = card.dataset.mapData;
    if (!mapData) {
        console.error('❌ Dados do mapa mental não encontrados no card');
        return;
    }

    // Se mapData for uma string JSON, faz o parse
    try {
        const parsed = JSON.parse(mapData);
        // Se conseguiu fazer parse, é JSON - converte para markdown
        mapData = jsonToMarkdownFallback(parsed);
    } catch (e) {
        // Se não conseguiu, já é uma string markdown - usa direto
    }

    expandMindMap(mapData);
}

// Tornar as funções globais para serem acessíveis via onclick no HTML
window.deleteSummary = deleteSummary;
window.deleteMindMap = deleteMindMap;
window.expandMindMap = expandMindMap;
window.expandMindMapByCardId = expandMindMapByCardId;
window.closeMindmapExpanded = closeMindmapExpanded;

// Event listener para fechar modal de expansão com ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('mindmap-expanded-modal');
        if (modal && !modal.classList.contains('hidden')) {
            closeMindmapExpanded();
        }
    }
});

// Event listener para fechar modal ao clicar fora dele
document.addEventListener('click', (e) => {
    const modal = document.getElementById('mindmap-expanded-modal');
    if (modal && e.target === modal) {
        closeMindmapExpanded();
    }
});


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
                        updateAiPanelContent(); // Atualizar painel de artefatos
                    }

                    hideModal();
                    // Renderiza com Markmap interativo em vez de HTML simples
                    renderMarkmap(mindMapData, mindMapContainer);
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

// --- LÓGICA DE LISTAS (UL / OL) - VERSÃO "ANTI-ROUBO DE FOCO" ---
    
    // Função auxiliar que configura o botão corretamente
    function setupListButton(btnElement, command) {
        if (!btnElement) return;

        // 1. O SEGREDO: Ao pressionar o botão (mousedown), impedimos o foco de sair do texto
        btnElement.addEventListener('mousedown', (e) => {
            e.preventDefault(); 
        });

        // 2. No clique, apenas executamos o comando. 
        // Como o foco nunca saiu do texto, o navegador sabe exatamente o que fazer.
        btnElement.addEventListener('click', (e) => {
            e.preventDefault();
            // Garante foco no editor por segurança
            pageContent.focus(); 
            document.execCommand(command, false, null);
            
            // Força a atualização visual dos botões
            if (typeof updateToolbarState === 'function') {
                updateToolbarState();
            }
        });
    }

    // Configura os botões usando as variáveis globais diretas
    setupListButton(ulBtn, 'insertUnorderedList');
    setupListButton(olBtn, 'insertOrderedList');

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
                    updateAiPanelContent(); // Atualizar painel de artefatos
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
    
    // --- 3. LÓGICA DO PINCEL DE FORMATAÇÃO (VERSÃO FINAL - VARREDURA DE ANCESTRAIS) ---
    let formatPainterActive = false;
    let copiedStyles = null; 

    // Lista de estilos que queremos copiar
    const relevantStyles = [
        'color', 'font-family', 'font-size', 'font-weight', 'font-style', 
        'vertical-align', 'text-transform'
    ];

    if (allToolbarButtons.formatPainterBtn) {
        allToolbarButtons.formatPainterBtn.addEventListener('click', () => {
            // Toggle de desativação
            if (formatPainterActive) {
                formatPainterActive = false;
                copiedStyles = null;
                allToolbarButtons.formatPainterBtn.classList.remove('btn-active');
                pageContent.style.cursor = 'text';
                return;
            }

            const selection = window.getSelection();
            if (!selection || !selection.rangeCount || selection.isCollapsed) {
                showModal('Atenção', 'Selecione o texto de origem para copiar a formatação.', { showCancelButton: false, confirmText: 'OK' });
                return;
            }

            // Pega o nó onde a seleção começa
            let currentNode = selection.getRangeAt(0).commonAncestorContainer;
            if (currentNode.nodeType === Node.TEXT_NODE) currentNode = currentNode.parentNode;

            copiedStyles = {};
            
            // Variáveis auxiliares para lógica cumulativa
            let foundBg = false;
            let foundDecoration = new Set(); // Para acumular underline, line-through, etc.

            // LOOP DE VARREDURA (SOBE A ÁRVORE ATÉ O BLOCO)
            // Isso garante que pegamos o fundo do pai, o itálico do filho, etc.
            while (currentNode && currentNode !== pageContent) {
                const computed = window.getComputedStyle(currentNode);
                const display = computed.display;

                // 1. CAPTURA DE ESTILOS BÁSICOS (Prioridade para o elemento mais interno/filho)
                relevantStyles.forEach(prop => {
                    if (!copiedStyles[prop] && computed.getPropertyValue(prop)) {
                        copiedStyles[prop] = computed.getPropertyValue(prop);
                    }
                });

                // 2. CAPTURA DE FUNDO (BACKGROUND) - O mais importante para o seu problema
                // Procura o primeiro ancestral que NÃO seja transparente
                if (!foundBg) {
                    const bg = computed.backgroundColor;
                    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                        copiedStyles['background-color'] = bg;
                        foundBg = true;
                    }
                }

                // 3. CAPTURA DE DECORAÇÃO (SUBLINHADO/RISCADO)
                // Acumula se encontrar tags específicas ou estilos computados
                if (computed.textDecorationLine.includes('underline') || currentNode.tagName === 'U') foundDecoration.add('underline');
                if (computed.textDecorationLine.includes('line-through') || currentNode.tagName === 'S' || currentNode.tagName === 'STRIKE' || currentNode.tagName === 'DEL') foundDecoration.add('line-through');

                // 4. CAPTURA DE NEGRITO E ITÁLICO (GARANTIA EXTRA)
                if (parseInt(computed.fontWeight) >= 600 || currentNode.tagName === 'B' || currentNode.tagName === 'STRONG') copiedStyles['font-weight'] = 'bold';
                if (computed.fontStyle === 'italic' || currentNode.tagName === 'I' || currentNode.tagName === 'EM') copiedStyles['font-style'] = 'italic';

                // Se chegou num elemento de bloco (P, DIV, H1...), para de subir para não pegar o fundo da página inteira
                if (display === 'block' || ['P', 'DIV', 'H1', 'H2', 'H3', 'LI'].includes(currentNode.tagName)) {
                    break;
                }

                currentNode = currentNode.parentNode;
            }

            // Consolida as decorações encontradas (ex: underline + line-through)
            if (foundDecoration.size > 0) {
                copiedStyles['text-decoration'] = Array.from(foundDecoration).join(' ');
            }

            // Verificação final
            if (!Object.keys(copiedStyles).length) {
                return;
            }

            // Ativa o modo pincel
            formatPainterActive = true;
            allToolbarButtons.formatPainterBtn.classList.add('btn-active');
            pageContent.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="black" stroke="white" stroke-width="1" d="M18.5,1.15a3.36,3.36,0,0,0-2.38.97L4.6,13.62a1.25,1.25,0,0,0-.35.84V17.5a1.25,1.25,0,0,0,1.25,1.25H8.54a1.25,1.25,0,0,0,.84-.35L20.88,6.88a3.36,3.36,0,0,0,0-4.76,3.36,3.36,0,0,0-2.38-.97ZM8.12,17H6.5V15.38L15.62,6.25l1.63,1.63Zm11-11L17.5,7.62,15.88,6,17.5,4.38a1.86,1.86,0,0,1,2.63,0,1.86,1.86,0,0,1,0,2.63Z"/></svg>') 0 24, auto`;
        });
    }

    if (pageContent) {
        pageContent.addEventListener('mouseup', () => {
            const selection = window.getSelection();
            // Se pincel inativo, ou nada copiado, ou seleção vazia -> sai
            if (!formatPainterActive || !copiedStyles || !selection || selection.isCollapsed) {
                return;
            }

            try {
                pageContent.focus();
                const range = selection.getRangeAt(0);
                const extracted = range.extractContents();

                // Função auxiliar para aplicar estilos em um elemento
                const applyStyles = (el) => {
                    for (const prop in copiedStyles) {
                        try { el.style.setProperty(prop, copiedStyles[prop]); } catch (e) { /* ignore */ }
                    }
                };

                // Reconstrói o conteúdo aplicando o estilo
                function processNode(node) {
                    // Texto vira SPAN com estilo
                    if (node.nodeType === Node.TEXT_NODE) {
                        if (node.textContent.trim() === '') return node.cloneNode(true); // Espaços vazios ignora
                        const span = document.createElement('span');
                        applyStyles(span);
                        span.textContent = node.textContent;
                        return span;
                    }
                    
                    // Elementos existentes
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Se for bloco, mantém estrutura e processa filhos
                        const display = window.getComputedStyle(node).display || '';
                        if (display === 'block' || ['P','DIV','H1','H2','H3','LI'].includes(node.nodeName)) {
                            const newBlock = node.cloneNode(false); // Clone raso
                            // Copia atributos
                            Array.from(node.attributes || []).forEach(attr => newBlock.setAttribute(attr.name, attr.value));
                            // Processa filhos
                            node.childNodes.forEach(child => newBlock.appendChild(processNode(child)));
                            return newBlock;
                        }

                        // Se for inline, cria novo SPAN wrapper para garantir limpeza de estilos conflitantes
                        // ou aplica em cima. Vamos simplificar criando um span limpo com os estilos copiados
                        const newSpan = document.createElement('span');
                        applyStyles(newSpan);
                        
                        // Processa os filhos recursivamente
                        node.childNodes.forEach(child => newSpan.appendChild(processNode(child)));
                        return newSpan;
                    }
                    return node.cloneNode(true);
                }

                const toInsert = document.createDocumentFragment();
                nodeLoop: for (const child of Array.from(extracted.childNodes)) {
                    toInsert.appendChild(processNode(child));
                }

                range.insertNode(toInsert);
                
                // Seleciona o que acabou de ser colado (feedback visual)
                selection.removeAllRanges();
                const newRange = document.createRange();
                newRange.selectNodeContents(toInsert.lastChild || toInsert); // Tenta focar no fim
                newRange.collapse(false);
                selection.addRange(newRange);

            } catch (e) {
                console.error('Erro Format Painter:', e);
            } finally {
                // Desliga tudo
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
// =======================================================================================================================================================
