window.ALBUM_DATA = {
  appName: 'Checklist Mundial',
  version: '0.7.6-ordem-album-994-extras-final',
  total: 994,
  // Ordem de layout ajustada: seleções na ordem do álbum e, ao final, 00 + FWC 01–19 antes da Coca-Cola.
  teams: [
    {group:'A', code:'MEX', name:'México'}, {group:'A', code:'RSA', name:'África do Sul'}, {group:'A', code:'KOR', name:'Coreia do Sul'}, {group:'A', code:'CZE', name:'República Tcheca'},
    {group:'B', code:'CAN', name:'Canadá'}, {group:'B', code:'BIH', name:'Bósnia'}, {group:'B', code:'QAT', name:'Qatar'}, {group:'B', code:'SUI', name:'Suíça'},
    {group:'C', code:'BRA', name:'Brasil'}, {group:'C', code:'MAR', name:'Marrocos'}, {group:'C', code:'HAI', name:'Haiti'}, {group:'C', code:'SCO', name:'Escócia'},
    {group:'D', code:'USA', name:'Estados Unidos'}, {group:'D', code:'PAR', name:'Paraguai'}, {group:'D', code:'AUS', name:'Austrália'}, {group:'D', code:'TUR', name:'Turquia'},
    {group:'E', code:'GER', name:'Alemanha'}, {group:'E', code:'CUW', name:'Curaçao'}, {group:'E', code:'CIV', name:'Costa do Marfim'}, {group:'E', code:'ECU', name:'Equador'},
    {group:'F', code:'NED', name:'Países Baixos'}, {group:'F', code:'JPN', name:'Japão'}, {group:'F', code:'SWE', name:'Suécia'}, {group:'F', code:'TUN', name:'Tunísia'},
    {group:'G', code:'BEL', name:'Bélgica'}, {group:'G', code:'EGY', name:'Egito'}, {group:'G', code:'IRN', name:'Irã'}, {group:'G', code:'NZL', name:'Nova Zelândia'},
    {group:'H', code:'ESP', name:'Espanha'}, {group:'H', code:'CPV', name:'Cabo Verde'}, {group:'H', code:'KSA', name:'Arábia Saudita'}, {group:'H', code:'URU', name:'Uruguai'},
    {group:'I', code:'FRA', name:'França'}, {group:'I', code:'SEN', name:'Senegal'}, {group:'I', code:'IRQ', name:'Iraque'}, {group:'I', code:'NOR', name:'Noruega'},
    {group:'J', code:'ARG', name:'Argentina'}, {group:'J', code:'ALG', name:'Argélia'}, {group:'J', code:'AUT', name:'Áustria'}, {group:'J', code:'JOR', name:'Jordânia'},
    {group:'K', code:'POR', name:'Portugal'}, {group:'K', code:'COD', name:'Congo'}, {group:'K', code:'UZB', name:'Uzbequistão'}, {group:'K', code:'COL', name:'Colômbia'},
    {group:'L', code:'ENG', name:'Inglaterra'}, {group:'L', code:'CRO', name:'Croácia'}, {group:'L', code:'GHA', name:'Gana'}, {group:'L', code:'PAN', name:'Panamá'}
  ],
  specialSections: [
    {group:'EXTRAS', code:'ZERO', displayCode:'00', name:'Figurinha 00 · Abertura', count: 1, start: 0, sectionKey:'ZERO-00'},
    {group:'EXTRAS', code:'FWC', name:'Figurinhas especiais FWC 01–19', count: 19, start: 1, sectionKey:'FWC-01-19'},
    {group:'EXTRAS', code:'COC', displayCode:'COC', name:'Coca-Cola', count: 14, start: 1, sectionKey:'COC-01-14'}
  ],
  sections: [
    {group:'A', code:'MEX', name:'México', kind:'team'}, {group:'A', code:'RSA', name:'África do Sul', kind:'team'}, {group:'A', code:'KOR', name:'Coreia do Sul', kind:'team'}, {group:'A', code:'CZE', name:'República Tcheca', kind:'team'},
    {group:'B', code:'CAN', name:'Canadá', kind:'team'}, {group:'B', code:'BIH', name:'Bósnia', kind:'team'}, {group:'B', code:'QAT', name:'Qatar', kind:'team'}, {group:'B', code:'SUI', name:'Suíça', kind:'team'},
    {group:'C', code:'BRA', name:'Brasil', kind:'team'}, {group:'C', code:'MAR', name:'Marrocos', kind:'team'}, {group:'C', code:'HAI', name:'Haiti', kind:'team'}, {group:'C', code:'SCO', name:'Escócia', kind:'team'},
    {group:'D', code:'USA', name:'Estados Unidos', kind:'team'}, {group:'D', code:'PAR', name:'Paraguai', kind:'team'}, {group:'D', code:'AUS', name:'Austrália', kind:'team'}, {group:'D', code:'TUR', name:'Turquia', kind:'team'},
    {group:'E', code:'GER', name:'Alemanha', kind:'team'}, {group:'E', code:'CUW', name:'Curaçao', kind:'team'}, {group:'E', code:'CIV', name:'Costa do Marfim', kind:'team'}, {group:'E', code:'ECU', name:'Equador', kind:'team'},
    {group:'F', code:'NED', name:'Países Baixos', kind:'team'}, {group:'F', code:'JPN', name:'Japão', kind:'team'}, {group:'F', code:'SWE', name:'Suécia', kind:'team'}, {group:'F', code:'TUN', name:'Tunísia', kind:'team'},
    {group:'G', code:'BEL', name:'Bélgica', kind:'team'}, {group:'G', code:'EGY', name:'Egito', kind:'team'}, {group:'G', code:'IRN', name:'Irã', kind:'team'}, {group:'G', code:'NZL', name:'Nova Zelândia', kind:'team'},
    {group:'H', code:'ESP', name:'Espanha', kind:'team'}, {group:'H', code:'CPV', name:'Cabo Verde', kind:'team'}, {group:'H', code:'KSA', name:'Arábia Saudita', kind:'team'}, {group:'H', code:'URU', name:'Uruguai', kind:'team'},
    {group:'I', code:'FRA', name:'França', kind:'team'}, {group:'I', code:'SEN', name:'Senegal', kind:'team'}, {group:'I', code:'IRQ', name:'Iraque', kind:'team'}, {group:'I', code:'NOR', name:'Noruega', kind:'team'},
    {group:'J', code:'ARG', name:'Argentina', kind:'team'}, {group:'J', code:'ALG', name:'Argélia', kind:'team'}, {group:'J', code:'AUT', name:'Áustria', kind:'team'}, {group:'J', code:'JOR', name:'Jordânia', kind:'team'},
    {group:'K', code:'POR', name:'Portugal', kind:'team'}, {group:'K', code:'COD', name:'Congo', kind:'team'}, {group:'K', code:'UZB', name:'Uzbequistão', kind:'team'}, {group:'K', code:'COL', name:'Colômbia', kind:'team'},
    {group:'L', code:'ENG', name:'Inglaterra', kind:'team'}, {group:'L', code:'CRO', name:'Croácia', kind:'team'}, {group:'L', code:'GHA', name:'Gana', kind:'team'}, {group:'L', code:'PAN', name:'Panamá', kind:'team'},
    {group:'EXTRAS', code:'ZERO', displayCode:'00', name:'Figurinha 00 · Abertura', count:1, start:0, kind:'special', sectionKey:'ZERO-00'},
    {group:'EXTRAS', code:'FWC', name:'Figurinhas especiais FWC 01–19', count:19, start:1, kind:'special', sectionKey:'FWC-01-19'},
    {group:'EXTRAS', code:'COC', displayCode:'COC', name:'Coca-Cola', count:14, start:1, kind:'special', sectionKey:'COC-01-14'}
  ]
};
