// Navigation architecture: 4 groups, 13 workspaces; sub-destinations drive the context bar tabs and the
// mobile "More" accordion (expands in place — no reload).
export const NAV = [
  { group: 'Operate', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', subs: [] },
    { id: 'planner', label: 'Planner', icon: 'planner', subs: [['timeline', 'Timeline'], ['today', 'Today'], ['week', 'Week'], ['history', 'History']] },
    { id: 'tasks', label: 'Tasks & Care', icon: 'tasks', subs: [['today', 'Today'], ['upcoming', 'Upcoming'], ['overdue', 'Overdue'], ['done', 'Completed'], ['quick', 'Quick Care']] },
  ] },
  { group: 'Collection', items: [
    { id: 'animals', label: 'Animals', icon: 'animals', subs: [['grid', 'Grid'], ['table', 'Table'], ['groups', 'Groups'], ['archive', 'Archive']] },
    { id: 'reproduction', label: 'Reproduction', icon: 'repro', subs: [['overview', 'Overview'], ['cycles', 'Cycles'], ['incubation', 'Incubation'], ['history', 'History']] },
    { id: 'health', label: 'Health', icon: 'health', subs: [['overview', 'Overview'], ['records', 'Records'], ['medication', 'Medication']] },
    { id: 'enclosures', label: 'Enclosures', icon: 'enclosure', subs: [['overview', 'Overview'], ['list', 'List'], ['assemblies', 'Assemblies'], ['habitat', 'Habitat Studio']] },
  ] },
  { group: 'Business', items: [
    { id: 'inventory', label: 'Inventory', icon: 'inventory', subs: [['overview', 'Overview'], ['stock', 'Stock'], ['transactions', 'Transactions'], ['shopping', 'Shopping']] },
    { id: 'finance', label: 'Finance', icon: 'finance', subs: [['overview', 'Overview'], ['transactions', 'Transactions'], ['monthly', 'Monthly'], ['tools', 'Calculators']] },
    { id: 'sales', label: 'Sales & Archive', icon: 'sales', subs: [['forsale', 'For sale'], ['reserved', 'Reserved'], ['sold', 'Sold'], ['archive', 'Deceased']] },
    { id: 'directory', label: 'Directory', icon: 'directory', subs: [['all', 'All'], ['breeders', 'Breeders'], ['vets', 'Veterinarians'], ['suppliers', 'Suppliers']] },
    { id: 'genetics', label: 'Genetics', icon: 'genetics', subs: [['calculator', 'Calculator'], ['projects', 'Projects'], ['saved', 'Saved']] },
  ] },
  { group: 'System', items: [
    { id: 'tools', label: 'Tools', icon: 'tools', subs: [] },
    { id: 'settings', label: 'Settings', icon: 'settings', subs: [['app', 'Application'], ['activities', 'Activities'], ['care', 'Care'], ['notifications', 'Notifications'], ['language', 'Language'], ['profile', 'Profile'], ['workspace', 'Workspaces']] },
  ] },
];
export const MODULES = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.id, i])));
