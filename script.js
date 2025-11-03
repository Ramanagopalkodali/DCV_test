// --- 1. Define Filter Data ---

// Function to generate years from startYear up to the current year (2025)
function generateYears(startYear) {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = startYear; year <= currentYear; year++) {
        years.push(String(year));
    }
    return years;
}

const data = {
    states: [
        "Alabama", "Alaska", "Arizona", "Arkansas", "California", 
        "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", 
        "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", 
        "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", 
        "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", 
        "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", 
        "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", 
        "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", 
        "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", 
        "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
    ],
    diseases: [
        "Cancer",
        "Heart Diseases",
        "Diabetes",
        "Kidney Diseases",
        "Influenza",
        "Tuberculosis"
    ],
    years: generateYears(2010) // Generates years 2010 through 2025
};

// --- 2. Function to Populate Dropdowns ---
function populateDropdowns() {
    const stateSelect = document.getElementById('state-select');
    const diseaseSelect = document.getElementById('disease-select');
    const yearSelect = document.getElementById('year-select');

    // Helper function to add options
    const addOptions = (selectElement, optionsArray) => {
        optionsArray.forEach(item => {
            const option = document.createElement('option');
            // Creates a URL-friendly value (e.g., "New York" -> "new-york")
            option.value = item.toLowerCase().replace(/[^a-z0-9]+/g, '-'); 
            option.textContent = item;
            selectElement.appendChild(option);
        });
    };

    addOptions(stateSelect, data.states);
    addOptions(diseaseSelect, data.diseases);
    addOptions(yearSelect, data.years);
}

// --- 3. Handle Search Button Click ---
function handleSearch() {
    const state = document.getElementById('state-select').value;
    const disease = document.getElementById('disease-select').value;
    const year = document.getElementById('year-select').value;

    // --- Validation ---
    if (!state || !disease || !year) {
        alert("Please select a State, a Disease, and a Year.");
        return;
    }

    // --- Redirection Logic (Modified for local testing) ---
    // This directs the user to your report page, passing the selections in the URL.
    const targetUrl = `report.html?state=${state}&disease=${disease}&year=${year}`;
    
    // Use this line to perform the actual redirect:
    window.location.href = targetUrl;
    
    // console.log("Redirecting to:", targetUrl); // Optional log
}

// --- 4. Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Populate the dropdowns when the page loads
    populateDropdowns();

    // 2. Attach the click listener to the Search button
    const searchButton = document.getElementById('search-btn');
    searchButton.addEventListener('click', handleSearch);
});
