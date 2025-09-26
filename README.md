<xaiArtifact artifact_id="802686f8-7617-49fa-aff5-b48d07dc9d82" artifact_version_id="08914110-3219-45bc-84b6-548983d701a7" title="README.md" contentType="text/markdown">

# 🏋️‍♀️ FitSplit: Blockchain-Based Group Fitness Payment System

Welcome to **FitSplit**, a decentralized solution for managing group fitness class payments on the Stacks blockchain using Clarity smart contracts. This project automates registration, payment splitting, and refund processes for fitness classes, ensuring transparency, fairness, and efficiency for instructors, venues, and participants.

## ✨ Features

- 💸 **Automated Payment Splitting**: Automatically splits class fees between instructors and venues based on predefined percentages.
- 📋 **Class Registration**: Securely register participants for group fitness classes with payment verification.
- 🔄 **Refunds**: Handles refunds for cancellations within a specified window.
- 🔐 **Immutable Records**: Tracks registrations, payments, and splits on the blockchain for transparency.
- ✅ **Verification**: Allows venues and instructors to verify payments and class details.
- 🛡️ **Escrow System**: Holds payments in escrow until class completion to ensure trust.

## 🛠 How It Works

**For Participants**
- Register for a class by calling `register-for-class` with the class ID and payment.
- Funds are held in escrow until the class is completed.
- If eligible, request a refund via `request-refund` within the refund window.

**For Instructors**
- Create a class using `create-class` with details like price, capacity, and venue split percentage.
- Receive automatic payouts after class completion via `complete-class`.
- Verify participant registrations with `get-class-details`.

**For Venues**
- Register as a venue using `register-venue`.
- Receive split payments automatically after class completion.
- Verify class and payment details using `get-payment-details`.

**For Admins**
- Manage platform fees and system parameters via `admin-update-fees`.
- Pause or resume contract operations in emergencies using `admin-pause-contract`.

