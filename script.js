document.addEventListener('DOMContentLoaded', () => {
    const queryInput = document.getElementById('query');
    const subredditInput = document.getElementById('subreddit');
    const searchButton = document.getElementById('search-button');
    const resultsDiv = document.getElementById('results');
    const tabButtons = document.querySelectorAll('.tab-button');

    const keywordFilterInput = document.getElementById('keyword-filter');
    const exportJsonButton = document.getElementById('export-json');
    const exportCsvButton = document.getElementById('export-csv');
    const exportTxtButton = document.getElementById('export-txt');
    const resultsControlsDiv = document.querySelector('.results-controls');
    const mainContent = document.querySelector('body > h1').parentNode;

    let currentService = 'reddit';
    let currentResultsData = [];
    const proxyUrl = 'https://api.allorigins.win/raw?url=';

    resultsControlsDiv.style.display = 'none';

    function downloadFile(filename, content, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function escapeCsvValue(value) {
        const stringValue = String(value || '');
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
    }

    function formatResultsAsJson(data) {
        return JSON.stringify(data, null, 2);
    }

    function formatResultsAsCsv(data) {
        if (data.length === 0) return '';
        const headers = ['Title', 'Link', 'Published Date', 'Author', 'Author Link', 'Category', 'Content Snippet'];
        let csvContent = headers.map(escapeCsvValue).join(',') + '\n';
        data.forEach(item => {
            const row = [
                item.title,
                item.link,
                item.updated ? new Date(item.updated).toISOString() : '',
                item.authorName,
                item.authorUri,
                item.category,
                item.contentText.replace(/\n/g, ' ').substring(0, 150) + '...'
            ];
            csvContent += row.map(escapeCsvValue).join(',') + '\n';
        });
        return csvContent;
    }

    function formatResultsAsTxt(data) {
        let txtContent = '';
        data.forEach((item, index) => {
            txtContent += `Item ${index + 1}\n`;
            txtContent += `----------------------------------------\n`;
            txtContent += `Title: ${item.title}\n`;
            txtContent += `Link: ${item.link}\n`;
            txtContent += `Published: ${item.updated ? new Date(item.updated).toLocaleString() : 'N/A'}\n`;
            txtContent += `Author: ${item.authorName || 'N/A'} ${item.authorUri ? '(' + item.authorUri + ')' : ''}\n`;
            txtContent += `Category: ${item.category || 'N/A'}\n`;
            txtContent += `Content:\n${item.contentText}\n`;
            txtContent += `\n========================================\n\n`;
        });
        return txtContent;
    }

    function getApiUrl(service, query, sub) {
        let urlBase = '';
        let urlParams = '';

        if (service === 'reddit') {
            urlBase = 'https://www.reddit.com/';
            if (sub) {
                urlBase += `r/${sub}/`;
            }
            urlParams = `search.rss?q=${encodeURIComponent(query)}&sort=new`;
            return urlBase + urlParams;
        } else if (service === 'lemmy') {
            console.warn("Lemmy URL generation not implemented yet.");
            return null;
        }
        return null;
    }

    async function fetchAndParseRss(service, query, sub) {
        const apiUrl = getApiUrl(service, query, sub);
        if (!apiUrl) {
            const errorMsg = service === 'lemmy' ? "Lemmy search/feed URL generation not implemented." : `Unknown service: ${service}`;
            console.error(errorMsg);
            resultsDiv.innerHTML = `<p>${errorMsg}</p>`;
            currentResultsData = [];
            resultsControlsDiv.style.display = 'none';
            return null;
        }

        console.log(`Fetching ${service}: ${apiUrl}`);
        resultsDiv.innerHTML = '<p>Loading...</p>';
        resultsControlsDiv.style.display = 'none';
        currentResultsData = [];

        try {
            const response = await fetch(proxyUrl + encodeURIComponent(apiUrl));
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} fetching ${apiUrl}`);
            }
            const str = await response.text();

            if (!str || !str.trim().startsWith('<')) {
                 throw new Error(`Invalid XML received for ${apiUrl}. Response: ${str.substring(0,100)}...`);
            }

            const xmlDoc = new window.DOMParser().parseFromString(str, "text/xml");

            const parserError = xmlDoc.querySelector('parsererror');
            if (parserError) {
                console.error("XML Parsing Error:", parserError.textContent);
                throw new Error(`Failed to parse XML for ${apiUrl}. Check console for details.`);
            }

            console.log(`${service} RSS Data:`, xmlDoc);
            parseAndStoreResults(xmlDoc, service);
            return { xml: str, parsed: currentResultsData };
        } catch (error) {
            console.error(`Error fetching or parsing ${service} RSS:`, error);
            resultsDiv.innerHTML = `<p>Error fetching ${service} results. ${error.message}.</p><p>Attempted URL: <a href="${apiUrl}" target="_blank">${apiUrl}</a></p>`;
            currentResultsData = [];
            resultsControlsDiv.style.display = 'none';
            return null;
        }
    }

    function parseAndStoreResults(xmlDoc, service) {
        currentResultsData = [];
        const entries = xmlDoc.querySelectorAll('entry');
        entries.forEach(entry => {
            const title = entry.querySelector('title')?.textContent || '';
            const link = entry.querySelector('link[href]')?.getAttribute('href') || '';
            const contentHTML = entry.querySelector('content')?.textContent || '';
            const updated = entry.querySelector('updated')?.textContent || '';
            const authorName = entry.querySelector('author > name')?.textContent || '';
            const authorUri = entry.querySelector('author > uri')?.textContent || '';
            const category = entry.querySelector('category[term]')?.getAttribute('term') || '';
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = contentHTML;
            const contentText = tempDiv.textContent || tempDiv.innerText || '';
            currentResultsData.push({ title, link, updated, authorName, authorUri, category, contentHTML, contentText });
        });
        console.log("Parsed Results Data:", currentResultsData);
    }

    function filterAndDisplayResults() {
        resultsDiv.innerHTML = '';
        const filterText = keywordFilterInput.value.toLowerCase().trim();
        const filteredData = currentResultsData.filter(item => {
            if (!filterText) return true;
            return (
                item.title.toLowerCase().includes(filterText) ||
                item.contentText.toLowerCase().includes(filterText) ||
                item.authorName.toLowerCase().includes(filterText) ||
                item.category.toLowerCase().includes(filterText)
            );
        });

        if (filteredData.length === 0) {
            resultsDiv.innerHTML = currentResultsData.length > 0 ? '<p>No results match your filter.</p>' : '<p>No results found.</p>';
            resultsControlsDiv.style.display = currentResultsData.length > 0 ? 'flex' : 'none';
            return;
        }

        resultsControlsDiv.style.display = 'flex';
        filteredData.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('result-item');
            let authorLink = item.authorName || 'N/A';
            if (item.authorUri && item.authorName) {
                authorLink = `<a href="${item.authorUri}" target="_blank">${item.authorName}</a>`;
            }
            let categoryInfo = item.category ? ` in <span class="category">${item.category}</span>` : '';
            let updatedInfo = '';
            if (item.updated) { try { updatedInfo = ` - ${new Date(item.updated).toLocaleString()}`; } catch (e) { updatedInfo = ` - ${item.updated}`; } }
            const contentDiv = document.createElement('div');
            contentDiv.innerHTML = item.contentHTML;
            contentDiv.querySelectorAll('script, iframe, style, link').forEach(el => el.remove());
            contentDiv.querySelectorAll('a').forEach(a => a.setAttribute('target', '_blank'));
            itemDiv.innerHTML = `<h3><a href="${item.link}" target="_blank">${item.title}</a></h3><div class="content-preview">${contentDiv.innerHTML}</div><p class="meta">By: ${authorLink}${categoryInfo}${updatedInfo}</p>`;
            resultsDiv.appendChild(itemDiv);
        });
    }

    function setupInteractiveListeners() {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                currentService = button.dataset.service;
                queryInput.value = '';
                subredditInput.value = '';
                resultsDiv.innerHTML = '';
                keywordFilterInput.value = '';
                currentResultsData = [];
                resultsControlsDiv.style.display = 'none';
                console.log(`Switched to ${currentService}`);
                subredditInput.placeholder = currentService === 'lemmy' ? "Instance/Community (e.g., lemmy.ml/c/linux)" : "Subreddit (optional)";
                 history.pushState({}, '', `?service=${currentService}`);
            });
        });

        searchButton.addEventListener('click', async () => {
            const query = queryInput.value.trim();
            const sub = subredditInput.value.trim();
            if (!query && !sub) {
                resultsDiv.innerHTML = '<p>Please enter a search query or a subreddit/community.</p>';
                currentResultsData = [];
                resultsControlsDiv.style.display = 'none';
                return;
            }
            keywordFilterInput.value = '';
             history.pushState({}, '', `?service=${currentService}&query=${encodeURIComponent(query)}&sub=${encodeURIComponent(sub)}`);
            await fetchAndParseRss(currentService, query, sub);
            filterAndDisplayResults();
        });

        keywordFilterInput.addEventListener('input', filterAndDisplayResults);

        exportJsonButton.addEventListener('click', () => {
            const dataToExport = getVisibleResultsData();
            if (dataToExport.length === 0) return alert('No visible results to export.');
            downloadFile('rss-export.json', formatResultsAsJson(dataToExport), 'application/json');
        });
        exportCsvButton.addEventListener('click', () => {
            const dataToExport = getVisibleResultsData();
            if (dataToExport.length === 0) return alert('No visible results to export.');
            downloadFile('rss-export.csv', formatResultsAsCsv(dataToExport), 'text/csv;charset=utf-8;');
        });
        exportTxtButton.addEventListener('click', () => {
            const dataToExport = getVisibleResultsData();
            if (dataToExport.length === 0) return alert('No visible results to export.');
            downloadFile('rss-export.txt', formatResultsAsTxt(dataToExport), 'text/plain;charset=utf-8;');
        });
    }

    async function handleUrlParameters() {
        const params = new URLSearchParams(window.location.search);
        const paramService = params.get('service')?.toLowerCase() || 'reddit';
        const paramQuery = params.get('query') || '';
        const paramSub = params.get('sub') || '';
        const paramFormat = params.get('format')?.toLowerCase();

        console.log("URL Params:", { paramService, paramQuery, paramSub, paramFormat });

         currentService = paramService;
         tabButtons.forEach(btn => {
             btn.classList.toggle('active', btn.dataset.service === currentService);
         });
         subredditInput.placeholder = currentService === 'lemmy' ? "Instance/Community (e.g., lemmy.ml/c/linux)" : "Subreddit (optional)";


        if (paramQuery || paramSub) {
            queryInput.value = paramQuery;
            subredditInput.value = paramSub;

            const fetchedData = await fetchAndParseRss(paramService, paramQuery, paramSub);

            if (fetchedData && paramFormat) {
                mainContent.innerHTML = `<h1>Exporting Data...</h1><p>Processing request for ${paramService} with query='${paramQuery}', sub='${paramSub}' in ${paramFormat.toUpperCase()} format.</p>`;
                let content = '';
                let mimeType = '';
                let filename = `rss-export-${paramService}-${paramQuery || 'feed'}-${paramSub || 'all'}.${paramFormat}`;

                switch (paramFormat) {
                    case 'json':
                        content = formatResultsAsJson(fetchedData.parsed);
                        mimeType = 'application/json';
                        break;
                    case 'csv':
                        content = formatResultsAsCsv(fetchedData.parsed);
                        mimeType = 'text/csv;charset=utf-8;';
                        break;
                    case 'txt':
                        content = formatResultsAsTxt(fetchedData.parsed);
                        mimeType = 'text/plain;charset=utf-8;';
                        break;
                    case 'xml':
                        content = fetchedData.xml;
                        mimeType = 'application/xml;charset=utf-8;';
                        filename = `rss-export-${paramService}-${paramQuery || 'feed'}-${paramSub || 'all'}.xml`;
                        break;
                    default:
                        console.error(`Unsupported format: ${paramFormat}`);
                         mainContent.innerHTML += `<p style="color: red;">Error: Unsupported format requested: ${paramFormat}. Supported formats: json, csv, txt, xml.</p>`;
                        return;
                }

                if (content) {
                    downloadFile(filename, content, mimeType);
                    mainContent.innerHTML += `<p>Download initiated for ${filename}.</p>`;
                } else {
                     mainContent.innerHTML += `<p style="color: red;">Error: Could not generate export content for format ${paramFormat}.</p>`;
                }

            } else if (fetchedData) {
                 filterAndDisplayResults();
                 setupInteractiveListeners();
            } else {
                 setupInteractiveListeners();
            }
        } else {
            console.log("Setting up default interactive mode.");
             resultsControlsDiv.style.display = 'none';
            setupInteractiveListeners();
        }
    }

     function getVisibleResultsData() {
         const filterText = keywordFilterInput.value.toLowerCase().trim();
         return currentResultsData.filter(item => {
             if (!filterText) return true;
             return (
                 item.title.toLowerCase().includes(filterText) ||
                 item.contentText.toLowerCase().includes(filterText) ||
                 item.authorName.toLowerCase().includes(filterText) ||
                 item.category.toLowerCase().includes(filterText)
             );
         });
     }


    handleUrlParameters();

});