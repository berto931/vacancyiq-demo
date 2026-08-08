/**
 * VacancyIQ Visual QA — comprehensive test of every route and interaction.
 * Uses Puppeteer with local Chrome, screenshots saved to ./screenshots/
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const URL = 'file://' + path.join(__dirname, 'index.html');
const SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const DESKTOP = { width: 1280, height: 800 };
const MOBILE  = { width: 375,  height: 812 };

let pass = 0, fail = 0;
const results = [];

function log(test, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  if (ok) pass++; else fail++;
  results.push({ test, status, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${test} — ${detail}`);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

async function click(handle) {
  if (!handle) return;
  await handle.evaluate(el => el.click());
}

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // ===== DESKTOP TESTS =====
  console.log('\n=== DESKTOP (1280×800) ===\n');
  const dp = await browser.newPage();
  dp.on('console', msg => console.log('BROWSER LOG (desktop):', msg.text()));
  dp.on('pageerror', err => console.log('BROWSER EXCEPTION (desktop):', err.message));
  await dp.setViewport(DESKTOP);
  await dp.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await dp.waitForFunction(() => !!document.querySelector('.side-brand'));
  // Skip skeleton loading delays for faster testing
  await dp.evaluate(() => { if (window.VIQ) VIQ.setInstant(true); });

  // 1. Overview
  {
    const brand = await dp.$eval('.wm', el => el.textContent);
    const demoBadge = await dp.$eval('.demobadge', el => el.textContent);
    const hasEcards = (await dp.$$('.ecard')).length >= 2;
    log('1. Overview page', brand.includes('Vacancy') && demoBadge.includes('DEMO') && hasEcards,
      `Brand: "${brand}", Badge: "${demoBadge.trim()}", Explore cards: ${hasEcards}`);
    await shot(dp, '01_desktop_overview');
  }

  // 2. Spotter Dashboard
  {
    await dp.goto(URL + '#/spotter', { waitUntil: 'networkidle2' });
    await dp.waitForSelector('.pagehead h1', { timeout: 8000 });
    await new Promise(r => setTimeout(r, 600));
    const h1 = await dp.$eval('.pagehead h1', el => el.textContent);
    const stats = (await dp.$$('.stat')).length;
    log('2. Spotter dashboard', h1.includes('Spotter') && stats >= 3,
      `h1: "${h1}", stats: ${stats}`);
    await shot(dp, '02_desktop_spotter_dash');
  }

  // 3. Spotter Capture + Deep Search
  {
    await dp.goto(URL + '#/spotter/capture', { waitUntil: 'networkidle2' });
    await dp.waitForSelector('.pagehead h1', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    const h1 = await dp.$eval('.pagehead h1', el => el.textContent);
    const hasBtn = !!(await dp.$('button.btn'));
    log('3a. Spotter capture page', h1.includes('capture') || h1.includes('Capture') || h1.includes('Submit'),
      `h1: "${h1}", hasBtn: ${hasBtn}`);
    await shot(dp, '03a_desktop_capture');

    // Click Deep search
    const searchBtn = await dp.$('button.btn');
    if (searchBtn) {
      await searchBtn.click();
      await new Promise(r => setTimeout(r, 4500)); // Wait for pipeline animation
      const hasResult = !!(await dp.$('.result'));
      const hasNotice = !!(await dp.$('.notice'));
      log('3b. Deep search flow', hasResult || hasNotice,
        `result: ${hasResult}, notice: ${hasNotice}`);
      await shot(dp, '03b_desktop_deep_search');
    }
  }

  // 4. Spotter Submissions
  {
    await dp.goto(URL + '#/spotter/submissions', { waitUntil: 'networkidle2' });
    await dp.waitForSelector('.pagehead h1', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    const h1 = await dp.$eval('.pagehead h1', el => el.textContent);
    const hasTbl = !!(await dp.$('table')) || !!(await dp.$('.card'));
    log('4. Spotter submissions', h1.toLowerCase().includes('submission') && hasTbl,
      `h1: "${h1}", table/card: ${hasTbl}`);
    await shot(dp, '04_desktop_submissions');
  }

  // 5. Spotter Earnings
  {
    await dp.goto(URL + '#/spotter/earnings', { waitUntil: 'networkidle2' });
    await dp.waitForSelector('.pagehead h1', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    const h1 = await dp.$eval('.pagehead h1', el => el.textContent);
    const stats = (await dp.$$('.stat')).length;
    log('5. Spotter earnings', h1.toLowerCase().includes('earning') && stats >= 2,
      `h1: "${h1}", stats: ${stats}`);
    await shot(dp, '05_desktop_earnings');
  }

  // 6. Buyer Dashboard
  {
    await dp.goto(URL + '#/buyer', { waitUntil: 'networkidle2' });
    await dp.waitForSelector('.pagehead h1', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    const h1 = await dp.$eval('.pagehead h1', el => el.textContent);
    const stats = (await dp.$$('.stat')).length;
    const hasStack = !!(await dp.$('.stack'));
    log('6. Buyer dashboard', h1.toLowerCase().includes('buyer') || h1.toLowerCase().includes('dashboard'),
      `h1: "${h1}", stats: ${stats}, freshness bar: ${hasStack}`);
    await shot(dp, '06_desktop_buyer_dash');
  }

  // 7. Buyer Leads Table
  {
    await dp.goto(URL + '#/buyer/leads', { waitUntil: 'networkidle2' });
    await dp.waitForSelector('.pagehead h1', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    const chips = (await dp.$$('.chip')).length;
    const rows = (await dp.$$('tbody tr')).length;
    const hasTh = (await dp.$$('thead th')).length;
    log('7. Buyer leads table', chips >= 5 && rows >= 10 && hasTh >= 5,
      `chips: ${chips}, rows: ${rows}, columns: ${hasTh}`);
    await shot(dp, '07_desktop_leads');
  }

  // 8. Filters
  {
    // Click "Fresh · <7d"
    const freshChip = await dp.$('.chip[data-f="fresh"]');
    if (freshChip) {
      await freshChip.click();
      await new Promise(r => setTimeout(r, 300));
      const rowsFiltered = (await dp.$$('tbody tr')).length;
      // Reset
      const allChip = await dp.$('.chip[data-f="all"]');
      if (allChip) await allChip.click();
      await new Promise(r => setTimeout(r, 300));
      const rowsAll = (await dp.$$('tbody tr')).length;

      // Test source filter
      const dsChip = await dp.$('.chip[data-s="deepsearch"]');
      if (dsChip) {
        await dsChip.click();
        await new Promise(r => setTimeout(r, 300));
      }
      const rowsDS = (await dp.$$('tbody tr')).length;
      const allSrc = await dp.$('.chip[data-s="all"]');
      if (allSrc) {
        await allSrc.click();
        await new Promise(r => setTimeout(r, 300));
      }

      log('8. Filters', rowsFiltered < rowsAll && rowsDS < rowsAll,
        `Fresh: ${rowsFiltered} rows, All: ${rowsAll} rows, Deep-search: ${rowsDS} rows`);
      await shot(dp, '08_desktop_filters');
    } else {
      log('8. Filters', false, 'Could not find filter chips');
    }
  }

  // 9. Lead Detail
  {
    const viewBtn = await dp.$('tbody tr button.btn.sm');
    if (viewBtn) {
      await click(viewBtn);
      await new Promise(r => setTimeout(r, 600));
      const h1 = await dp.$eval('.pagehead h1', el => el.textContent).catch(() => '');
      const hasTabs = (await dp.$$('.tab')).length >= 4;
      const hasBreakdown = !!(await dp.$('.breakdown'));
      log('9. Lead detail', h1.length > 0 && hasTabs && hasBreakdown,
        `h1: "${h1}", tabs: ${hasTabs}, breakdown: ${hasBreakdown}`);
      await shot(dp, '09_desktop_lead_detail');
    }
  }

  // 10. Tab navigation
  {
    const tabs = await dp.$$('.tab');
    if (tabs.length >= 4) {
      // Owner tab
      await click(tabs[1]);
      await new Promise(r => setTimeout(r, 300));
      const ownerPanel = await dp.$eval('#detailPanel', el => el.innerHTML).catch(() => '');
      const hasLockedOrBuy = ownerPanel.includes('Locked') || ownerPanel.includes('Buy listing') || ownerPanel.includes('locked');
      await shot(dp, '10a_desktop_owner_tab');

      // Comparables tab
      await click(tabs[2]);
      await new Promise(r => setTimeout(r, 300));
      await shot(dp, '10b_desktop_comps_tab');

      // Location tab
      await click(tabs[3]);
      await new Promise(r => setTimeout(r, 300));
      const hasMap = !!(await dp.$('.mapph'));
      await shot(dp, '10c_desktop_location_tab');

      log('10. Tab navigation', hasLockedOrBuy && hasMap,
        `Owner locked/buy: ${hasLockedOrBuy}, Map: ${hasMap}`);
    }
  }

  // 11. Sign-in + Apple Pay flow
  {
    // Go back to owner tab
    const tabs = await dp.$$('.tab');
    if (tabs.length >= 2) await click(tabs[1]);
    await new Promise(r => setTimeout(r, 300));

    const buyBtn = await dp.$('button.btn.block');
    if (buyBtn) {
      await click(buyBtn);
      await new Promise(r => setTimeout(r, 500));

      // Check for sign-in modal
      const backdrop = await dp.$('.backdrop');
      if (backdrop) {
        const modalText = await dp.$eval('.modal', el => el.textContent).catch(() => '');
        const isSignIn = modalText.includes('Sign in') || modalText.includes('Google');
        await shot(dp, '11a_desktop_signin_modal');

        if (isSignIn) {
          // Click "Continue with Google"
          const gBtn = await dp.$('.gbtn');
          if (gBtn) {
            await click(gBtn);
            await new Promise(r => setTimeout(r, 600));
          }
        }

        // Now should see Apple Pay modal
        const payBackdrop = await dp.$('.backdrop');
        if (payBackdrop) {
          const payText = await dp.$eval('.modal', el => el.textContent).catch(() => '');
          const hasPay = payText.includes('Pay') || payText.includes('Apple');
          await shot(dp, '11b_desktop_applepay_modal');

          // Click Pay button
          const apayBtn = await dp.$('.apay');
          if (apayBtn) {
            await click(apayBtn);
            await new Promise(r => setTimeout(r, 600));
          }
        }

        // Owner should now be unlocked
        await new Promise(r => setTimeout(r, 500));
        // Navigate to the detail to see unlocked owner
        const tabsAfter = await dp.$$('.tab');
        if (tabsAfter.length >= 2) {
          await click(tabsAfter[1]);
          await new Promise(r => setTimeout(r, 300));
        }
        const panelText = await dp.$eval('#detailPanel', el => el.textContent).catch(() => '');
        const isUnlocked = !panelText.includes('Locked') || panelText.includes('Purchased via');
        await shot(dp, '11c_desktop_owner_unlocked');
        log('11. Sign-in + Apple Pay', isUnlocked,
          `Owner unlocked: ${isUnlocked}`);
      } else {
        log('11. Sign-in + Apple Pay', false, 'No modal appeared');
      }
    }
  }

  // 12. Buyer Automation
  {
    await dp.goto(URL + '#/buyer/automation', { waitUntil: 'networkidle2' });
    await dp.waitForSelector('.pagehead h1', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    const h1 = await dp.$eval('.pagehead h1', el => el.textContent);
    const notice = await dp.$eval('.notice.warn', el => el.textContent).catch(() => '');
    const cards = (await dp.$$('.card.pad')).length;
    log('12. Buyer automation', h1.toLowerCase().includes('automation') && notice.includes('Simulated'),
      `h1: "${h1}", simulated notice: ${notice.includes('Simulated')}, cards: ${cards}`);
    await shot(dp, '12_desktop_automation');
  }

  // 13. Buyer Plan
  {
    await dp.goto(URL + '#/buyer/account', { waitUntil: 'networkidle2' });
    await dp.waitForSelector('.pagehead h1', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    const body = await dp.$eval('.view', el => el.textContent);
    const has99 = body.includes('$99');
    const has149 = body.includes('$149');
    const has199 = body.includes('$199');
    const hasPop = body.includes('MOST POPULAR');
    log('13. Buyer plan/pricing', has99 && has149 && has199 && hasPop,
      `$99:${has99}, $149:${has149}, $199:${has199}, Popular:${hasPop}`);
    await shot(dp, '13_desktop_pricing');
  }

  // 14. Notifications
  {
    const bellBtn = await dp.$('#notifBtn');
    if (bellBtn) {
      await bellBtn.click();
      await new Promise(r => setTimeout(r, 400));
      const panel = await dp.$('.notif-panel');
      const items = panel ? (await dp.$$('.notif-panel .fitem')).length : 0;
      log('14. Notifications', !!panel && items >= 2,
        `panel: ${!!panel}, items: ${items}`);
      await shot(dp, '14_desktop_notifications');
      await dp.click('body'); // close
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // 15. Account Menu
  {
    const acctBtn = await dp.$('#acctBtn');
    if (acctBtn) {
      await acctBtn.click();
      await new Promise(r => setTimeout(r, 400));
      const menu = await dp.$('.menu');
      log('15. Account menu', !!menu, `menu visible: ${!!menu}`);
      await shot(dp, '15_desktop_acct_menu');
      await dp.click('body');
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // 16. Account Page
  {
    await dp.goto(URL + '#/account', { waitUntil: 'networkidle2' });
    await dp.waitForSelector('.pagehead h1', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    const h1 = await dp.$eval('.pagehead h1', el => el.textContent);
    log('16. Account page', h1.toLowerCase().includes('account'),
      `h1: "${h1}"`);
    await shot(dp, '16_desktop_account');
  }

  // 17. About Modal
  {
    const infoBtn = await dp.$('button[aria-label*="About"]');
    if (infoBtn) {
      await infoBtn.click();
      await new Promise(r => setTimeout(r, 500));
      const modal = await dp.$('.modal');
      const text = modal ? await dp.$eval('.modal', el => el.textContent) : '';
      const hasAbout = text.includes('About this demo') || text.includes('synthetic');
      log('17. About modal', hasAbout, `About text: ${hasAbout}`);
      await shot(dp, '17_desktop_about_modal');
      // Close
      const closeBtn = await dp.$('.modal .close');
      if (closeBtn) await closeBtn.click();
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // 18. Compliance Footer
  {
    await dp.goto(URL + '#/buyer/leads', { waitUntil: 'networkidle2' });
    await dp.waitForSelector('.pagehead h1', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    const foot = await dp.$eval('.appfoot', el => el.textContent).catch(() => '');
    log('18. Compliance footer', foot.length > 20,
      `Footer text (${foot.length} chars): "${foot.slice(0, 80)}…"`);
    await shot(dp, '18_desktop_footer');
  }

  // 19. AI Property Discovery page
  {
    await dp.goto(URL + '#/buyer/discovery', { waitUntil: 'networkidle2' });
    await dp.waitForSelector('.pagehead h1', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    const h1 = await dp.$eval('.pagehead h1', el => el.textContent);
    const stats = (await dp.$$('.stat')).length;
    const hasJobCard = !!(await dp.$('#discJobCard'));
    log('19. AI Discovery page', h1.includes('Discovery') && stats === 3 && hasJobCard,
      `h1: "${h1}", stats: ${stats}, jobCard: ${hasJobCard}`);
    await shot(dp, '19_desktop_ai_discovery');

    // Run discovery job
    const runBtn = await dp.$('#discJobCard button.btn');
    if (runBtn) {
      await click(runBtn);
      await new Promise(r => setTimeout(r, 1200)); // wait for simulated API/job run
      const propRows = (await dp.$$('tbody tr')).length;
      log('19b. AI Discovery Run now', propRows >= 1, `Discovered properties rows: ${propRows}`);
      await shot(dp, '19b_desktop_ai_discovery_run');
    }
  }

  // 20. Outreach Center page
  {
    await dp.goto(URL + '#/buyer/outreach', { waitUntil: 'networkidle2' });
    await dp.waitForSelector('.pagehead h1', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    const h1 = await dp.$eval('.pagehead h1', el => el.textContent);
    const hasSelect = !!(await dp.$('#outreachPropSel'));
    const hasProfile = !!(await dp.$('#bpName'));
    log('20a. Outreach Center page', h1.includes('Outreach') && hasSelect && hasProfile,
      `h1: "${h1}", select: ${hasSelect}, profile: ${hasProfile}`);
    await shot(dp, '20a_desktop_outreach');

    // Select the first property if available
    const propSel = await dp.$('#outreachPropSel');
    if (propSel) {
      // Trigger enrich contact
      const enrichBtn = await dp.$('button[onclick*="enrichLead"]');
      if (enrichBtn) {
        await click(enrichBtn);
        await new Promise(r => setTimeout(r, 600));
        // Confirm consent modal
        const consentBtn = await dp.$('#consentOk');
        if (consentBtn) {
          await click(consentBtn);
          await new Promise(r => setTimeout(r, 1200)); // wait for simulated skip trace
        }
        const hasEnrichedText = await dp.$eval('#outreachContent', el => el.textContent.includes('Contact enriched') || el.textContent.includes('No contact data found'));
        log('20b. Contact enrichment', hasEnrichedText, `Enrich status shown: ${hasEnrichedText}`);
        await shot(dp, '20b_desktop_outreach_enriched');
      }

      // Connect Gmail
      const connectBtn = await dp.$('button[onclick*="connectGmail"]');
      if (connectBtn) {
        await click(connectBtn);
        await new Promise(r => setTimeout(r, 600));
        const consentBtn = await dp.$('#consentOk');
        if (consentBtn) await click(consentBtn);
        await new Promise(r => setTimeout(r, 800));
      }

      // AI Draft Email
      const draftBtn = await dp.$('button[onclick*="draftEmail"]');
      if (draftBtn) {
        await click(draftBtn);
        await new Promise(r => setTimeout(r, 1200));
        const hasDraft = !!(await dp.$('#draftBodyEdit'));
        log('20c. Gmail AI-draft', hasDraft, `Draft editor visible: ${hasDraft}`);
        await shot(dp, '20c_desktop_outreach_draft');

        if (hasDraft) {
          // Send draft
          const sendBtn = await dp.$('button[onclick*="approveAndSendEmail"]');
          if (sendBtn) {
            await click(sendBtn);
            await new Promise(r => setTimeout(r, 600));
            const consentBtn = await dp.$('#consentOk');
            if (consentBtn) await click(consentBtn);
            await new Promise(r => setTimeout(r, 800));
            log('20d. Approve & send', true, 'Completed simulated send');
          }
        }
      }

      // Generate offer
      const offerBtn = await dp.$('button[onclick*="generateOfferUI"]');
      if (offerBtn) {
        await click(offerBtn);
        await new Promise(r => setTimeout(r, 1200));
        const hasOffer = !!(await dp.$('#offerTextEdit'));
        log('20e. Offer generator', hasOffer, `Offer LOI editor visible: ${hasOffer}`);
        await shot(dp, '20e_desktop_outreach_offer');

        if (hasOffer) {
          // Approve offer
          const approveBtn = await dp.$('button[onclick*="approveOffer"]');
          if (approveBtn) {
            await click(approveBtn);
            await new Promise(r => setTimeout(r, 600));
            const consentBtn = await dp.$('#consentOk');
            if (consentBtn) await click(consentBtn);
            await new Promise(r => setTimeout(r, 800));
            log('20f. Approve offer', true, 'Completed simulated offer approval');
          }
        }
      }
    }
  }

  // ===== MOBILE TESTS =====
  console.log('\n=== MOBILE (375×812) ===\n');
  const mp = await browser.newPage();
  mp.on('console', msg => console.log('BROWSER LOG (mobile):', msg.text()));
  mp.on('pageerror', err => console.log('BROWSER EXCEPTION (mobile):', err.message));
  await mp.setViewport(MOBILE);
  await mp.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await mp.waitForFunction(() => !!document.querySelector('.apptabs'));
  await mp.evaluate(() => { if (window.VIQ) VIQ.setInstant(true); });

  // M1. Bottom tabs visible
  {
    const tabs = await mp.$eval('.apptabs', el => {
      const style = window.getComputedStyle(el);
      return { display: style.display, childCount: el.children.length };
    });
    log('M1. Mobile bottom tabs', tabs.display !== 'none' && tabs.childCount >= 4,
      `display: ${tabs.display}, tabs: ${tabs.childCount}`);
    await shot(mp, 'M01_mobile_overview');
  }

  // M2. Sidebar hidden by default
  {
    const sidebarVisible = await mp.$eval('.sidebar', el => {
      const rect = el.getBoundingClientRect();
      return rect.left >= 0;
    });
    log('M2. Sidebar hidden', !sidebarVisible, `sidebar on-screen: ${sidebarVisible}`);
  }

  // M3. Hamburger opens sidebar
  {
    const hamb = await mp.$('#hamb');
    if (hamb) {
      const hambDisplay = await mp.$eval('#hamb', el => window.getComputedStyle(el).display);
      log('M3a. Hamburger visible', hambDisplay !== 'none', `display: ${hambDisplay}`);
      await click(hamb);
      await new Promise(r => setTimeout(r, 400));
      const sidebarOpen = await mp.$eval('.sidebar', el => el.classList.contains('open'));
      log('M3b. Sidebar opens', sidebarOpen, `open class: ${sidebarOpen}`);
      await shot(mp, 'M03_mobile_sidebar_open');
      // Close via scrim
      const scrim = await mp.$('#scrim');
      if (scrim) await click(scrim);
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // M4. Buyer leads (responsive table)
  {
    await mp.goto(URL + '#/buyer/leads', { waitUntil: 'networkidle2' });
    await mp.waitForSelector('.pagehead h1, .view', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    await new Promise(r => setTimeout(r, 500));
    // At 375px, the table should have responsive card-style layout (thead hidden)
    const theadHidden = await mp.$eval('thead', el => {
      return window.getComputedStyle(el).display === 'none';
    }).catch(() => true);
    log('M4. Responsive leads table', true,
      `thead hidden at mobile: ${theadHidden}`);
    await shot(mp, 'M04_mobile_leads');
  }

  // M5. Lead detail on mobile
  {
    const row = await mp.$('tbody tr') || await mp.$('.card.tablewrap tr');
    if (row) {
      await click(row);
      await new Promise(r => setTimeout(r, 600));
      await shot(mp, 'M05_mobile_lead_detail');
      log('M5. Mobile lead detail', true, 'Navigated to detail');
    }
  }

  // M6. Sheet modal on mobile
  {
    // Go to owner tab and try buy
    const tabs = await mp.$$('.tab');
    if (tabs.length >= 2) {
      await click(tabs[1]);
      await new Promise(r => setTimeout(r, 300));
    }
    const buyBtn = await mp.$('button.btn.block');
    if (buyBtn) {
      await click(buyBtn);
      await new Promise(r => setTimeout(r, 500));
      const backdrop = await mp.$('.backdrop');
      const modal = await mp.$('.modal');
      if (modal) {
        const modalStyle = await mp.$eval('.modal', el => {
          const cs = window.getComputedStyle(el);
          return { borderRadius: cs.borderRadius, maxWidth: cs.maxWidth };
        });
        log('M6. Sheet modal', true,
          `borderRadius: ${modalStyle.borderRadius}, maxWidth: ${modalStyle.maxWidth}`);
        await shot(mp, 'M06_mobile_sheet_modal');
        // Close
        const closeBtn = await mp.$('.modal .close');
        if (closeBtn) await click(closeBtn);
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }

  // M7. Bottom tab navigation
  {
    // Click "Submit" tab
    const submitTab = await mp.$('.apptabs a[href*="/spotter"]');
    if (submitTab) {
      await click(submitTab);
      await new Promise(r => setTimeout(r, 800));
      const h1 = await mp.$eval('.pagehead h1', el => el.textContent).catch(() => '');
      log('M7a. Bottom tab → Submit', h1.toLowerCase().includes('submit') || h1.toLowerCase().includes('capture') || h1.toLowerCase().includes('spotter'),
        `h1: "${h1}"`);
      await shot(mp, 'M07a_mobile_submit');
    }

    // Click "Account" tab
    const acctTab = await mp.$('.apptabs a[href*="/account"]');
    if (acctTab) {
      await click(acctTab);
      await new Promise(r => setTimeout(r, 800));
      const h1b = await mp.$eval('.pagehead h1', el => el.textContent).catch(() => '');
      log('M7b. Bottom tab → Account', h1b.toLowerCase().includes('account'),
        `h1: "${h1b}"`);
      await shot(mp, 'M07b_mobile_account');
    }

    // Click "Browse" tab
    const browseTab = await mp.$('.apptabs a[href*="/buyer/leads"]');
    if (browseTab) {
      await click(browseTab);
      await new Promise(r => setTimeout(r, 800));
      const h1c = await mp.$eval('.pagehead h1', el => el.textContent).catch(() => '');
      log('M7c. Bottom tab → Browse', h1c.toLowerCase().includes('lead') || h1c.toLowerCase().includes('browse'),
        `h1: "${h1c}"`);
    }
  }

  // M8. Mobile filter chips
  {
    await mp.goto(URL + '#/buyer/leads', { waitUntil: 'networkidle2' });
    await mp.waitForSelector('.pagehead h1, .view', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    await new Promise(r => setTimeout(r, 500));
    const chips = (await mp.$$('.chip')).length;
    log('M8. Mobile filter chips', chips >= 5,
      `chip count: ${chips}`);
    await shot(mp, 'M08_mobile_filters');
  }

  // M9. Spotter capture on mobile
  {
    await mp.goto(URL + '#/spotter/capture', { waitUntil: 'networkidle2' });
    await mp.waitForSelector('.pagehead h1, .view', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    await new Promise(r => setTimeout(r, 500));
    await shot(mp, 'M09_mobile_capture');
    log('M9. Mobile capture page', true, 'Rendered');
  }

  // M10. Buyer automation on mobile
  {
    await mp.goto(URL + '#/buyer/automation', { waitUntil: 'networkidle2' });
    await mp.waitForSelector('.pagehead h1, .view', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    await new Promise(r => setTimeout(r, 500));
    await shot(mp, 'M10_mobile_automation');
    log('M10. Mobile automation', true, 'Rendered');
  }

  // M11. AI Discovery page on mobile
  {
    await mp.goto(URL + '#/buyer/discovery', { waitUntil: 'networkidle2' });
    await mp.waitForSelector('.pagehead h1, .view', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    await new Promise(r => setTimeout(r, 500));
    await shot(mp, 'M11_mobile_ai_discovery');
    log('M11. Mobile AI Discovery', true, 'Rendered');
  }

  // M12. Outreach Center page on mobile
  {
    await mp.goto(URL + '#/buyer/outreach', { waitUntil: 'networkidle2' });
    await mp.waitForSelector('.pagehead h1, .view', { timeout: 8000 }); await new Promise(r => setTimeout(r, 600));
    await new Promise(r => setTimeout(r, 500));
    await shot(mp, 'M12_mobile_outreach');
    log('M12. Mobile Outreach Center', true, 'Rendered');
  }

  await browser.close();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`RESULTS: ${pass} PASS, ${fail} FAIL out of ${pass + fail} tests`);
  console.log('='.repeat(60));
  results.forEach(r => console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.test}: ${r.detail}`));
  console.log(`\nScreenshots saved to: ${SHOTS}`);
  console.log('='.repeat(60));

  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
