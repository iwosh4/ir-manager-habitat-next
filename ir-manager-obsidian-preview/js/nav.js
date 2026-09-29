// Navigace — pořadí podle zadání. Podsekce odpovídají současnému /app-manager/ (shell.php ir_nav_items).
export const NAV = [
  { id: 'prehled', label: 'Přehled', icon: 'dashboard', glyph: 'dashboard', subs: [] },
  { id: 'zvirata', label: 'Zvířata', icon: 'animals', glyph: 'animals', subs: [['mrizka', 'Mřížka'], ['tabulka', 'Tabulka'], ['skupiny', 'Skupiny'], ['karantena', 'Karanténa / léčba'], ['archiv', 'Archiv']] },
  { id: 'ukoly', label: 'Úkoly & péče', icon: 'tasks', glyph: 'task', subs: [['dnes', 'Dnes'], ['planovac', 'Plánovač'], ['rychla-pece', 'Rychlá péče'], ['suplementace', 'Suplementace']] },
  { id: 'zdravi', label: 'Zdraví', icon: 'health', glyph: 'health', subs: [['prehled', 'Přehled'], ['zaznamy', 'Záznamy'], ['lecba', 'Léčba']] },
  { id: 'ubikace', label: 'Ubikace', icon: 'habitat', glyph: 'habitat', subs: [['prehled', 'Přehled'], ['seznam', 'Seznam'], ['sestavy', 'Sestavy'], ['studio', 'Habitat Studio']] },
  { id: 'reprodukce', label: 'Reprodukce', icon: 'reproduction', glyph: 'reproduction', subs: [['prehled', 'Přehled'], ['cykly', 'Cykly'], ['inkubace', 'Inkubace']] },
  { id: 'sklad', label: 'Sklad', icon: 'inventory', glyph: 'inventory', subs: [['prehled', 'Přehled'], ['polozky', 'Položky'], ['nakup', 'Nákupní seznam']] },
  { id: 'finance', label: 'Finance', icon: 'finance', glyph: 'finance', subs: [['prehled', 'Přehled'], ['zaznamy', 'Záznamy']] },
  { id: 'adresar', label: 'Adresář', icon: 'profile', glyph: 'user', subs: [['kontakty', 'Kontakty'], ['dokumenty', 'Dokumenty'], ['akce', 'Burzy & akce']] },
];
export const SECONDARY = [
  { id: 'nastroje', label: 'Nástroje', icon: 'calculator', subs: [] },
];
export const HIDDEN = [{ id: 'nastaveni', label: 'Nastavení', icon: 'settings', subs: [['aplikace', 'Aplikace'], ['zive', 'Živý pás & pohyb'], ['aktivity', 'Aktivity'], ['oznameni', 'Oznámení'], ['data', 'Data & obnova']] }];
export const MODULES = Object.fromEntries([...NAV, ...SECONDARY, ...HIDDEN].map((m) => [m.id, m]));
