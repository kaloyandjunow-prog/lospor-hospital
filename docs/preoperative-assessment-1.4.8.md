# LOSPOR Hospital 1.4.8 preoperative profile administration

[Български](preoperative-assessment-1.4.8.bg.md) | **English**

LOSPOR ships one bundled catalogue of preoperative questions, versioned with
the Hospital release (1.4.8). Each appliance has one profile that says which of
those questions its clinicians are asked. Status changes that profile in place;
there is no second definition source and no profile versions.

> **Since 1.5.5: one profile for adults and one for children.** A case follows
> the profile of its mode, so a question asked of both (latex allergy, for
> example) can be required for children and optional for adults. On the
> upgrade the children's profile starts as a copy of the existing one, so
> nothing changes until an administrator changes it. The editor has an
> **Adults** and a **Children** view, each listing only the questions that
> population is asked, and each saved on its own. Baseline questions keep their
> fixed place in the form, next to the scores they feed: they are listed apart
> and cannot be dragged, and the order applies to the added questions within
> each form section. Before 1.5.5 the editor let a baseline question be dragged
> although the form ignored its position.

## What an administrator can change

From Status → Hospital controls → Clinical, an administrator can:

- switch a bundled question on or off;
- make a switched-on question required or optional;
- change the order of the questions, by dragging or with the up and down
  buttons;
- inspect each question's label, answer type, options, applicability, and
  conditional rule, which cannot be edited; and
- preview the form in use.

Saving requires the current Status administrator password and a reason. The
API rejects incomplete catalogues, duplicate order numbers, unknown question
keys, and questions that are required while switched off. Every change is
audited.

Administrators cannot edit or delete bundled questions or add their own. A new
question or a changed clinical definition requires a software release.

On a new installation the 30 baseline questions (the `BASE_*` keys) are on and
recommended by default; the 45 adult and pediatric additions are off. None of
the baseline questions is required by default, but an administrator can mark
each enabled question required independently. An unanswered recommended
question does not block continuing; an unanswered required question does.

## What clinicians see

The web app and the PWA, in both the tabbed and the scrolled layout, follow the
profile:

- a switched-on question appears in the form section it belongs to, in the
  administrator's order;
- a follow-up question appears only when its parent is answered Yes;
- a required question carries an asterisk;
- a suggestion drawn from imported hospital records can be accepted or
  rejected, and is offered only while the question is unanswered;
- a switched-off baseline control is hidden, and a risk score that needs a
  switched-off answer says it is not available rather than showing a number
  that understates the risk.

## Switching a question on or off

A change applies to every case from its next load, including cases in
progress. A case starts asking a question switched on, and stops asking one
switched off. Answers already given are kept and exported. A question switched
off before anyone answered it leaves no row for that case.

A draft always saves, whatever is unanswered. Required questions are checked
when the clinician continues from the preoperative assessment to the
intraoperative record: the web app and the PWA list the required questions
still unanswered and stay on the preoperative form. Recommended questions are
visible guidance, not a gate.

A finalized case is never changed by a profile change.

## Research and OMOP

Every catalogue question is recorded as one answer row per case, and those
rows are what research and OMOP export read. Each question carries its OMOP
concept in the catalogue; where no standard concept says what the question
asks, the concept is 0 and the LOSPOR source value identifies the question.
