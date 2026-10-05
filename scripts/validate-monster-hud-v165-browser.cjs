process.env.QA_HUD_EDGES='1';
process.env.QA_OUTPUT ||= 'reports/monster-hud-v165/verified';
require('./validate-monster-numbers-v164-browser.cjs');
