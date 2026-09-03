export const McpClient = ({ children }) => <>{children}</>;

export const ClientPicker = ({ children }) => {
  const unwrap = (c) => (c && c.props && c.props.children && c.props.children.props && c.props.children.props.group ? c.props.children : c);
  const clients = [].concat(children).map(unwrap).filter((c) => c && c.props && c.props.group);
  const [selected, setSelected] = useState(clients[0]?.props.name);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const current = clients.find((c) => c.props.name === selected) || clients[0];
  const groups = [];
  clients.forEach((c) => {
    if (!c.props.name.toLowerCase().includes(query.toLowerCase())) return;
    let g = groups.find((x) => x.name === c.props.group);
    if (!g) groups.push((g = { name: c.props.group, items: [] }));
    g.items.push(c);
  });

  const pick = (name) => {
    setSelected(name);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="not-prose">
      <div ref={ref} className="relative inline-flex items-stretch text-sm rounded-xl border border-gray-950/10 dark:border-white/10 bg-white dark:bg-gray-900">
        <span className="px-3 py-2 text-gray-500 dark:text-gray-400 border-r border-gray-950/10 dark:border-white/10">Client</span>
        <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 px-3 py-2 font-medium text-gray-900 dark:text-white">
          <img src={current.props.icon} alt="" className="h-4 w-4" />
          {current.props.name}
          <svg className={"h-3.5 w-3.5 text-gray-500 transition-transform " + (open ? "rotate-180" : "")} viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-gray-950/10 dark:border-white/10 bg-white dark:bg-gray-900 shadow-lg">
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="w-full bg-transparent px-3 py-2 text-sm outline-none border-b border-gray-950/10 dark:border-white/10 text-gray-900 dark:text-white" />
            <div className="max-h-96 overflow-y-auto py-1">
              {groups.map((g) => (
                <div key={g.name}>
                  <div className="px-3 pt-2 pb-1 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{g.name}</div>
                  {g.items.map((c) => (
                    <button key={c.props.name} type="button" onClick={() => pick(c.props.name)} className={"flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-white/10 " + (c.props.name === selected ? "text-primary dark:text-primary-light" : "text-gray-700 dark:text-gray-200")}>
                      <img src={c.props.icon} alt="" className="h-4 w-4" />
                      {c.props.name}
                    </button>
                  ))}
                </div>
              ))}
              {groups.length === 0 && <div className="px-3 py-2 text-gray-500">No matches</div>}
            </div>
          </div>
        )}
      </div>
      <div className="prose dark:prose-invert mt-4">{current}</div>
    </div>
  );
};
