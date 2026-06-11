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
  try {
    // Launch a headless browser instance
    console.log('[pdfGenerator] Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new', // Use the new headless mode
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Recommended for server environments
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
