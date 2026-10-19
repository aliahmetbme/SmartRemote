//
//  LGWebSocketSecurityPolicy.h
//  SmartRemote
//
//  Device-specific TLS certificate validation for LG webOS TV secure WebSockets (wss:3001).
//

#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

#if __has_include(<SocketRocket/SocketRocket.h>)
#import <SocketRocket/SocketRocket.h>
#elif __has_include(<SocketRocket/SRSecurityPolicy.h>)
#import <SocketRocket/SRSecurityPolicy.h>
#endif

NS_ASSUME_NONNULL_BEGIN

@interface LGWebSocketSecurityPolicy : SRSecurityPolicy

/** Shared policy configured with LG webOS CA anchor verification. */
+ (instancetype)policyForLGTV;

/** The intermediate CA certificate used to cryptographically anchor LG TV certificates. */
+ (nullable SecCertificateRef)lgIntermediateCACertificate;

@end

@interface LGTVTLSModule : NSObject <RCTBridgeModule>

/** Record a diagnostic entry for the latest TLS evaluation. */
+ (void)recordTLSStatus:(NSString *)domain
                success:(BOOL)success
               leafCert:(nullable SecCertificateRef)leafCert
                  error:(nullable CFErrorRef)error;

@end

/**
 * Dedicated native iOS WebSocket client using NSURLSessionWebSocketTask.
 * Bypasses SocketRocket's deprecated CFStream TLS limitations on modern iOS,
 * executing explicit SecTrust validation anchored strictly to the LG intermediate CA.
 */
@interface LGNativeWebSocketModule : RCTEventEmitter <RCTBridgeModule, NSURLSessionWebSocketDelegate>

@end

NS_ASSUME_NONNULL_END

