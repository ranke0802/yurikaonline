process.env.QA_FOOT_EDGES='1';
process.env.QA_HUD_EDGES='1';
process.env.QA_OUTPUT ||= 'reports/monster-foot-v166/verified';
require('./validate-monster-numbers-v164-browser.cjs');
