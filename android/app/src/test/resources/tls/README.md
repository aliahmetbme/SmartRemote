These certificates are synthetic, test-only fixtures generated locally with OpenSSL.
No private keys are included. The test CA is not bundled in the app and is never trusted
by the production transport. Leaf CNs model the expected product identity; they are not
certificates captured from LG hardware. Valid fixtures expire in 2040; the CA in 2046.
The expired fixture and client-only EKU fixture exercise explicit rejection paths.
The production anchor is independently loaded from src/main/res/raw in the JVM test.
