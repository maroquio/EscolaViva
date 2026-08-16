# ADR 0004 — CPF as the access identifier, e-mail back to being contact only

**Status:** accepted — Stage 01
**Partially superseded by ADR 0006:** the central decision still holds and comes out reinforced.
What falls away is only the consequence "a guardian without a CPF gets no portal" — under ADR
0006's premises, a guardian without a CPF stops being registrable at all, not merely barred from
access.

## Context

Login used to be `networkSlug + email + password`, and the e-mail played two roles that are not the
same one: identifying whoever signs in, and saying where to send messages. That blocked editing a
record — the path that started this work — because `guardian.email` (academics) and `app_user.email`
(identity) are independent columns that the product treated as if they were one.

The proof that the promise was false is in the help text of `registrar/guardian_new.eta`: *"Único na
rede. É por ele que o responsável entra quando o administrador criar o acesso"*. Nothing in the model
guaranteed that — `inviteUser` accepted any e-mail typed in, and the divergence could be born on the
very first invitation, with no editing involved.

The schema change follows the compatibility window of ADR 0003 (I6): `0007_cpf.sql` opened the window
— a nullable `cpf` column on `app_user` and `guardian`, login accepting CPF or e-mail — and
`0008_cpf_obrigatorio.sql` closes it, once the seed proved every `app_user` row already has a CPF.

## Decision

The access identifier becomes the **CPF**, which does not change. E-mail goes back to being contact
only.

The link between a person's record (`guardian`, in academics) and their credential (`app_user`, in
identity) is now made through the CPF. Because the CPF is immutable, the divergence problem stops
existing by construction — it is not patched, it is eliminated.

A CPF is not a secret and does not become an authentication factor: the credential is still the
password. What the CPF brings is stable identification.

**Rejected:** keeping the e-mail as the identifier and merely making the divergence visible on
screen — showing a warning whenever `guardian.email` and `app_user.email` for the same person
differed. That alternative treats the symptom, not the cause: it does not stop the divergence from
being born, it only reports it after the fact, and every new screen touching both records would have
to remember to repeat the check. Changing the identifier removes the whole category of problem
instead of instrumenting it.

## Consequences

- **E-mail stops being unique per network.** `0008` drops `user_email_unique_in_network` — the
  constraint only made sense while the e-mail identified. A mother and a father can now share one
  family e-mail.
- **A guardian without a CPF gets no portal.** `guardian.cpf` stays nullable forever, with the
  partial index from `0007`: whoever does not supply a CPF still exists as a contact and shows up on
  the student's record, but `inviteUser` does not create access without a valid CPF. This is the
  explicit decision about the foreign guardian.
- **A CPF is personal data and now travels on every login attempt**, not just at registration — under
  the LGPD, that weighs more than an identifier that was typed once. `FORBIDDEN_LOG_KEYS` in
  `src/shared/constants.ts`, read by `src/shared/log/redaction.ts`, already redacts `cpf` before this
  commit, and the CPF never enters a query string; the redaction was written in anticipation of this
  day.
- **The window is proven, not merely described.** The test asserting "during the window, e-mail still
  signs in" is deleted — not commented out, not skipped — and gives way to its photographic negative,
  "e-mail no longer signs in". The two ends, side by side in the commit history, are the executable
  demonstration of I6: no migration drops what the previous version reads, and the new code proves it
  stopped needing what the next migration removes.
