# Helium agent skills

Skills that teach AI agents (Claude Code, Codex, Cursor and others) how to work with Helium. Customers install them with:

```bash
npx skills add cloudcaptainai/docs --skill helium-data-access
```

This folder is excluded from the published docs site by `.mintignore`. The install page is `data-access/agent-skill.mdx`.

## Adding an investigation

1. Add `helium-data-access/references/<name>.md`. Follow the existing recipes: when to use it, numbered steps with one runnable query each, how to read the result, and what to report.
2. Add one line for it under **Investigation recipes** in `helium-data-access/SKILL.md`, and in the list on `data-access/agent-skill.mdx`.
3. Run every query against `customer_v1` as an org user before merging. Use only columns from `data-access/schema.mdx`.

Keep rules that apply to every query in `SKILL.md`, and anything specific to one investigation in its recipe. When the `customer_v1` schema or API limits change, update `SKILL.md` along with the docs pages.
