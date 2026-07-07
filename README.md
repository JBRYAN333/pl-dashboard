# 🏆 PL Dashboard — DW2 Pro League

Dashboard oficial da Pro League do Drunken Wrestlers 2. Records, rankings, estatísticas e painel administrativo.

## Arquitetura

```
pl-dashboard/
├── web/                # Dashboard público (GitHub Pages)
│   ├── index.html      # SPA principal
│   ├── css/            # Estilos
│   ├── js/             # Lógica (sem framework, vanilla)
│   └── assets/         # Imagens, logos, flags
├── firebase/           # Configuração Firestore + Auth
│   ├── firestore.rules # Regras de segurança
│   └── config.js       # Config do Firebase
├── scripts/            # Scripts utilitários
│   ├── export-pdf.js   # Exporta record book em PDF formatado
│   ├── export-sheets.js# Exporta pra Google Sheets
│   └── migrate.js      # Migra dados do JSON pra Firestore
└── README.md
```

## Custo
- **GitHub Pages:** R$ 0
- **Firebase Spark (grátis):** 50k leituras/dia, 20k escritas/dia, 1GB storage
- **Firebase Auth:** R$ 0 (ilimitado)

## Funcionalidades

### Dashboard Público
- Ranking por região (EU 🇪🇺, NA 🇺🇸, SA 🌎, AS 🇰🇷, Global 🌍)
- Perfil do player (record, win%, rounds, streak, FOTNs)
- Histórico de partidas com VOD
- Stats globais e por região
- Timeline de eventos

### Painel Admin (login)
- Adicionar/editar players (nome, região, tier, afiliação)
- Registrar partidas (result, score, rounds, opponent, event, VOD, FOTN)
- Criar/editar eventos
- Gerenciar rankings
- Export PDF (formato record book atual)
- Export Google Sheets (opcional)

## Regiões
| Região | Flag | Cor |
|--------|------|-----|
| EU | 🇪🇺 | #003BB5 |
| NA | 🇺🇸 | #BF0000 |
| SA | 🌎 | #009C3B |
| AS | 🇰🇷 | #FF6600 |
| Global | 🌍 | #00BFFF |
