// Minimal i18n: English is the source language; Czech covers navigation, header, core actions and statuses.
let lang = 'en';
const CS = {
  'Dashboard': 'Přehled', 'Planner': 'Plánovač', 'Tasks & Care': 'Úkoly a péče', 'Tasks': 'Úkoly', 'Animals': 'Zvířata', 'Reproduction': 'Rozmnožování', 'Health': 'Zdraví', 'Enclosures': 'Terária',
  'Inventory': 'Sklad', 'Finance': 'Finance', 'Sales & Archive': 'Prodej a archiv', 'Directory': 'Adresář', 'Genetics': 'Genetika', 'Tools': 'Nástroje', 'Settings': 'Nastavení', 'Home': 'Domů', 'More': 'Více',
  'Operate': 'Provoz', 'Collection': 'Chov', 'Business': 'Obchod', 'System': 'Systém',
  'Record': 'Zapsat', 'Search': 'Hledat', 'Search animals, tasks, enclosures…': 'Hledat zvířata, úkoly, terária…', 'Notifications': 'Upozornění', 'Saved': 'Uloženo', 'Saving…': 'Ukládám…',
  'Today': 'Dnes', 'Tomorrow': 'Zítra', 'Yesterday': 'Včera', 'Upcoming': 'Nadcházející', 'Overdue': 'Po termínu', 'Completed': 'Hotovo', 'Done': 'Hotovo', 'Now': 'Teď', 'NOW': 'TEĎ',
  'Later': 'Později', 'Skip': 'Přeskočit', 'Undo': 'Zpět', 'Edit': 'Upravit', 'Open': 'Otevřít', 'Complete all': 'Dokončit vše', 'Add': 'Přidat', 'Cancel': 'Zrušit', 'Save': 'Uložit', 'Close': 'Zavřít',
  'Feeding': 'Krmení', 'Water': 'Voda', 'Misting': 'Rosení', 'Cleaning': 'Čištění', 'Weight': 'Hmotnost', 'Shed': 'Svlékání', 'Task': 'Úkol', 'Add Animal': 'Přidat zvíře', 'Quick Record': 'Rychlý zápis',
  'Overview': 'Přehled', 'Grid': 'Mřížka', 'Table': 'Tabulka', 'Groups': 'Skupiny', 'Archive': 'Archiv', 'Records': 'Záznamy', 'Medication': 'Léčba', 'Cycles': 'Cykly', 'Incubation': 'Inkubace', 'Assemblies': 'Sestavy',
  'Stock': 'Zásoby', 'Transactions': 'Pohyby', 'Shopping': 'Nákupy', 'Monthly': 'Měsíčně', 'Calculators': 'Kalkulačky', 'Breeders': 'Chovatelé', 'Veterinarians': 'Veterináři', 'Suppliers': 'Dodavatelé', 'Contacts': 'Kontakty',
  'For sale': 'Na prodej', 'Reserved': 'Rezervováno', 'Sold': 'Prodáno', 'Deceased': 'Uhynulo', 'Edit workspace': 'Upravit plochu', 'Add widget': 'Přidat widget', 'Reset to default': 'Obnovit výchozí', 'Done editing': 'Hotovo',
  'Open Habitat Studio': 'Otevřít Habitat Studio', 'Open Planner': 'Otevřít plánovač', 'FED': 'NAKRMENO', 'DONE': 'HOTOVO', 'CHECK': 'KONTROLA', 'CONFIRM': 'POTVRDIT', 'GIVEN': 'PODÁNO', 'SAVE': 'ULOŽIT', 'SHED': 'SVLEČENO',
};
export const setLang = (l) => { lang = l === 'cs' ? 'cs' : 'en'; document.documentElement.lang = lang; };
export const getLang = () => lang;
export const t = (s) => (lang === 'cs' && CS[s]) || s;
