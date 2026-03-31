# Contributing Guidelines

## Overview

This repository follows a structured Git workflow to ensure code quality, stability, and efficient collaboration. All contributions must adhere to the branching, commit, and pull request standards outlined below.

---

## Branch Strategy

We follow a modified Git Flow model:

* **main**

  * Contains production-ready code only
  * Always stable and deployable
  * Updated via merges from `develop` or `hotfix/*`

* **develop**

  * Integration branch for ongoing development
  * All feature branches merge here first
  * Acts as the staging area for releases

* **feature/***

  * Used for developing new features
  * Branch from: `develop`
  * Merge into: `develop`
  * Example: `feature/user-authentication`

* **bugfix/***

  * Used for fixing non-critical bugs
  * Branch from: `develop`
  * Merge into: `develop`
  * Example: `bugfix/login-validation-error`

* **hotfix/***

  * Used for critical production fixes
  * Branch from: `main`
  * Merge into: `main` and `develop`
  * Example: `hotfix/payment-crash`

* **enhancement/***

  * Used for improvements to existing features
  * Branch from: `develop`
  * Merge into: `develop`
  * Example: `enhancement/api-performance`

---

## Branch Naming Convention

Use clear, concise, and kebab-case naming:

* `feature/short-description`
* `bugfix/short-description`
* `hotfix/short-description`
* `enhancement/short-description`

Guidelines:

* Use lowercase letters only
* Replace spaces with hyphens
* Keep names descriptive but concise
* Reference ticket/issue IDs when applicable

  * Example: `feature/123-add-user-profile`

---

## Commit Message Format

Follow a structured commit message format:

```
[TYPE] Brief description (max 50 chars)

Optional detailed explanation (wrap at 72 chars).
Include context, reasoning, and any relevant notes.
```

### Types:

* **feat**: New feature
* **fix**: Bug fix
* **docs**: Documentation changes
* **style**: Formatting, no logic changes
* **refactor**: Code restructuring without behavior change
* **test**: Adding or updating tests
* **chore**: Maintenance tasks

Example:

```
[feat] Add JWT authentication

Implements token-based authentication for API routes.
Includes middleware for request validation.
```

---

## Pull Request Process

1. Create a branch from `develop` (or `main` for hotfixes)
2. Ensure your branch is up to date with the base branch
3. Write clean, tested, and well-documented code
4. Push your branch and open a Pull Request (PR)
5. Link relevant issues in the PR description
6. Request at least one code review
7. Address all feedback and ensure CI checks pass
8. Squash or rebase commits if required
9. Merge only after approval

---

## Code Quality Expectations

* Follow language-specific best practices (React, Python)
* Write meaningful, maintainable code
* Include unit/integration tests where applicable
* Avoid committing secrets or sensitive data
* Ensure linting and formatting checks pass

---

## DevOps & CI/CD Expectations

* All PRs must pass automated checks (linting, tests, build)
* No direct commits to `main` or `develop`
* Use feature flags for incomplete functionality when needed
* Keep PRs small and focused for easier review

---

## Additional Notes

* Prefer small, incremental changes over large PRs
* Communicate early if work is blocked or unclear
* When in doubt, prioritize readability and simplicity
