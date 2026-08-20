/*
 * Runs before the project suite (the `preload` entry in `bunfig.project.toml`), and its whole job is
 * to take the database away.
 *
 * These eight files read the repository from disk: folder layout, conventions, the Dockerfile, the
 * documentation. None of them opens a connection, which is why they run without Postgres — that is
 * the point of the second configuration.
 *
 * The danger is what happens when that configuration meets a test that *does* use the database. The
 * root `bunfig.toml` preloads a script that swaps `DATABASE_URL` for the throwaway one and refuses
 * to start when the two are the same; this configuration does not preload it, so a database test
 * running here would find `DATABASE_URL` pointing at the developer's own database and truncate it
 * between cases, exactly as it is designed to do.
 *
 * That is not hypothetical. On 2026-08-19, while measuring whether this separation was worth doing,
 * `bun test --config=<a config without preload> tests/` matched `apps/api/tests/` as well — Bun
 * filters by substring of path — and 1097 database tests ran against the development database and
 * emptied it. It took a seed to get back, and there was no backup.
 *
 * `pathIgnorePatterns` in the configuration is what keeps that command from reaching those tests,
 * and it is a good guard for as long as nobody edits it. This file is the second one, and it does
 * not depend on a pattern being right: with no `DATABASE_URL` in the environment, a test that wants
 * a database fails while reading its configuration, loudly, before opening anything.
 */

delete Bun.env.DATABASE_URL;
delete Bun.env.TEST_DATABASE_URL;
