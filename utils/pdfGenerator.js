/**
 * pdfGenerator.js
 * Utility to generate PDF buffers from HTML strings using Puppeteer.
 */

'use strict';

const puppeteer = require('puppeteer');

/**
 * Generate a PDF buffer from an HTML string.
 * @param {string} html - The HTML content to render.
 * @returns {Promise<Buffer>} - The generated PDF buffer.
 */
async function generatePdfBuffer(html) {
  let browser = null;
  const fs = require('fs');
  
  // Try to find local Chrome or Edge if default puppeteer fails
  const commonPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  let executablePath = undefined;
  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      executablePath = p;
      break;
    }
  }

  try {
    // Launch a headless browser instance
    console.log('[pdfGenerator] Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new', // Use the new headless mode
      executablePath: executablePath, // Use local browser if found, to prevent Chromium download issues
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], 
    });
    console.log('[pdfGenerator] Browser launched successfully.');
    const page = await browser.newPage();
    
    // Set the HTML content of the page
    await page.setContent(html, {
      waitUntil: 'networkidle0', // Wait until all resources (like fonts/images) are loaded
    });

    // Generate the PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true, // Ensure CSS backgrounds and colors are printed
      margin: {
        top: '20px',
        bottom: '20px',
        left: '20px',
        right: '20px',
      },
    });

    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('[pdfGenerator] Error generating PDF:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { generatePdfBuffer };
