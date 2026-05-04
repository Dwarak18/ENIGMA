# Copilot Instructions

## Project Context

This project implements a multi-layer secure data pipeline combining:

* Browser-based entropy capture
* ESP32 cryptographic processing
* PostgreSQL storage
* Hardhat blockchain verification

The system is NOT a simple application — it is a structured cryptographic pipeline.

---

## Coding Rules

1. Always follow defined architecture layers
2. Do NOT invent shortcuts
3. Do NOT replace logic with placeholders
4. Maintain strict function separation
5. Use explicit data structures

---

## Security Rules

* Never expose AES keys
* Always hash before blockchain storage
* Do not trust frontend-generated values
* Validate all inputs at backend

---

## Code Style

* Use async/await
* Avoid nested callbacks
* Write reusable functions
* Keep modules isolated

---

## Output Expectations

When generating code:

* Include full working implementation
* Include error handling
* Include comments explaining logic
* Avoid vague or incomplete snippets

---

## Verification Awareness

Every generated component must support:

* Reproducibility
* Hash verification
* Data traceability

---

## Failure Handling

If unsure:

* Do NOT guess
* Do NOT simplify
* Ask for missing constraints OR implement safest fallback

---

## Final Principle

This system is only as strong as its weakest layer.

Do not compromise any layer for convenience.
