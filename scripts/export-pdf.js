/**
 * export-pdf.js — Gera o record book em PDF formatado
 * 
 * Roda client-side no painel admin. Usa html2pdf.js para converter
 * um template HTML em PDF idêntico ao layout atual do Google Docs.
 * 
 * O PDF mantém:
 *   - Organização por região (EU, NA, SA, AS, Global)
 *   - Tabelas de ranking com cores
 *   - Records individuais por player
 *   - Links de VOD clicáveis
 *   - Seção de unranked por tier
 *   - Cabeçalho "DW2PL RECORD BOOK"
 */

function generateRecordBookHTML(data, vods) {
  const regions = ['EU', 'NA', 'SA', 'AS', 'Global'];
  const regionColors = { EU: '#003BB5', NA: '#BF0000', SA: '#009C3B', AS: '#FF6600', Global: '#00BFFF' };
  const regionFlags = { EU: '🇪🇺', NA: '🇺🇸', SA: '🌎', AS: '🇰🇷', Global: '🌍' };
  
  let html = `
    <style>
      @page { size: A4; margin: 2cm; }
      body { font-family: 'Inter', Arial, sans-serif; color: #1a1a1a; }
      h1 { text-align: center; font-size: 28px; margin-bottom: 8px; letter-spacing: 2px; }
      .subtitle { text-align: center; color: #666; font-size: 14px; margin-bottom: 32px; }
      h2 { font-size: 20px; color: ${regionColors.EU}; border-bottom: 2px solid currentColor; padding-bottom: 4px; margin: 24px 0 12px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
      th { background: #f0f0f0; padding: 6px 8px; text-align: left; font-weight: 600; border: 1px solid #ddd; }
      td { padding: 6px 8px; border: 1px solid #ddd; }
      .pos { font-weight: 700; }
      .champion { color: #FFD700; font-weight: 700; }
      .win { color: #00aa44; font-weight: 600; }
      .loss { color: #cc0000; }
      .fotn { background: #fff8e0; }
      .forfeit { color: #999; font-style: italic; }
      .vod a { color: #0066cc; text-decoration: none; }
      .player-name { font-weight: 600; font-size: 14px; margin: 16px 0 4px; }
      .unranked { margin: 8px 0 16px; }
      .unranked h3 { font-size: 13px; color: #555; margin: 4px 0; }
      .unranked ul { list-style: none; padding-left: 16px; font-size: 12px; }
      .unranked li { padding: 1px 0; }
    </style>
    <h1>DW2PL RECORD BOOK</h1>
    <p class="subtitle">Drunk