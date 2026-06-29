# CivicPulse Firestore Security Spec

This specification outlines the data invariants, threat model payloads (The "Dirty Dozen"), and verification paths for securing the `reports` collection.

## 1. Data Invariants

1. **Authentication Boundary**: Every civic report creation or update operation (except public read-only lists) must be authenticated with a valid UID from Firebase Auth.
2. **Immutability**: Crucial geographical details (`latitude`, `longitude`), creation metadata (`createdAt`), and structural elements (`category`, `summary`, `description`) must remain immutable after initial submission to prevent history spoofing or coordinate tampering.
3. **Upvoting Boundaries**: Confirmation upvotes must increment atomically by exactly 1 per write, and no other fields may be modified in that specific transition.
4. **Operations Dispatch Boundaries**: Only authorized status transitions and specific municipal operational keys (`progressStage`, `status`, `assignedTeam`, `afterImageUrl`) may be modified during dispatch updates. All other keys remain locked.
5. **Type and Size Hardening**: String fields must have explicit size boundaries to prevent Denial of Wallet payload bloat attacks.

---

## 2. The "Dirty Dozen" Malicious Payloads

The following payloads represent attacks attempting to violate identity, integrity, and state transitions. All of these must be rejected with `PERMISSION_DENIED`.

### Payload 1: Zero-Authentication Creation
An unauthenticated request attempting to create a report.
- **Expected Result**: `PERMISSION_DENIED`

### Payload 2: Future-Dated Creation
Attempting to register a report with a future timestamp to gain visual priority in chronological feeds.
- **Expected Result**: `PERMISSION_DENIED`

### Payload 3: Spoofed Confirmation Inception
Creating a new report with pre-seeded `confirmations = 9999` to cheat the emergency priority ranking.
- **Expected Result**: `PERMISSION_DENIED`

### Payload 4: Arbitrary Confirmation Increment
Updating a report to set `confirmations = 100` instead of increments of 1.
- **Expected Result**: `PERMISSION_DENIED`

### Payload 5: Coordinate Hijacking (Location Tampering)
Attempting to update the `latitude` and `longitude` coordinates of an existing report to redirect municipal focus.
- **Expected Result**: `PERMISSION_DENIED`

### Payload 6: Category or Content Spoofing
Attempting to rewrite the `category`, `summary`, or `description` of an existing incident report.
- **Expected Result**: `PERMISSION_DENIED`

### Payload 7: Ghost Field Injection (Shadow Update)
Attempting to inject unrequested administrative fields like `isSuperAdmin = true` or `verifiedStatus = true` inside the update payload.
- **Expected Result**: `PERMISSION_DENIED`

### Payload 8: Denial of Wallet (Size Limit Violation)
Submitting a 10MB base64 string as the `suggestedAction` or `description` field.
- **Expected Result**: `PERMISSION_DENIED`

### Payload 9: Invalid Status Transition
Attempting to update status to an unsupported value (e.g., `status = "Deleted"`).
- **Expected Result**: `PERMISSION_DENIED`

### Payload 10: Unverified Email Spoof
Creating a report using an account that has a spoofed domain and unverified email address (if verification is strictly enforced).
- **Expected Result**: `PERMISSION_DENIED`

### Payload 11: System Field Bypass
Attempting to update system-generated fields like `priorityRank` or `confidence` directly via the client SDK.
- **Expected Result**: `PERMISSION_DENIED`

### Payload 12: Negative Upvotes
Attempting to decrease the confirmation count (`confirmations = -1` or decrementing).
- **Expected Result**: `PERMISSION_DENIED`

---

## 3. Test Verification Suite (`firestore.rules.test.ts`)

```typescript
// Conceptual verification schema for unit test suite
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";

describe("CivicPulse Firestore Rules", () => {
  let testEnv: any;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "civicpulse-test-rules",
    });
  });

  it("denies unauthenticated read/write to restricted scopes", async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthDb.collection("reports").add({ summary: "Broken pipe" }));
  });

  it("permits authenticated report creations conforming strictly to schema", async () => {
    const authDb = testEnv.authenticatedContext("citizen_123").firestore();
    await assertSucceeds(
      authDb.collection("reports").add({
        category: "Road Infrastructure",
        severity: "Moderate",
        summary: "Pothole on Main St",
        description: "Deep pothole causing traffic slowdowns.",
        latitude: 12.9716,
        longitude: 77.5946,
        status: "Pending",
        confirmations: 0,
        createdAt: new Date(),
        suggestedAction: "Fill with cold asphalt mix"
      })
    );
  });
});
```
