/**
 * pdfGenerator.js
 * Utility to generate PDF buffers from HTML strings using Puppeteer.
 */

'use strict';

const isWin = process.platform === 'win32';

let puppeteer;
let chromium;

if (isWin) {
  puppeteer = require('puppeteer');
} else {
  puppeteer = require('puppeteer-core');
  chromium = require('@sparticuz/chromium');
}

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
    if (isWin) {
      browser = await puppeteer.launch({
        headless: 'new', // Use the new headless mode
        args: ['--no-sandbox', '--disable-setuid-sandbox'], // Recommended for server environments
      });
    } else {
      // Production Serverless/Cloud setup (Render Linux environment)
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
    }
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
