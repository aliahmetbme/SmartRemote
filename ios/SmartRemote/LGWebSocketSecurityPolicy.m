//
//  LGWebSocketSecurityPolicy.m
//  SmartRemote
//
//  Device-specific TLS certificate validation for LG webOS TV secure WebSockets (wss:3001).
//

#import "LGWebSocketSecurityPolicy.h"
#import <React/RCTWebSocketModule.h>
#import <CommonCrypto/CommonDigest.h>

// Embedded DER bytes for "LGE SSG Intermediate CA"
static const unsigned char lg_intermediate_ca_der[1533] = {
0x30, 0x82, 0x05, 0xf9, 0x30, 0x82, 0x03, 0xe1, 0xa0, 0x03, 0x02, 0x01, 0x02, 0x02, 0x02, 0x10, 0x07, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b, 0x05, 0x00, 0x30, 0x81, 0xa7, 0x31, 0x0b, 0x30, 0x09, 0x06, 0x03, 0x55, 0x04, 0x06, 0x13, 0x02, 0x4b, 0x52, 0x31, 0x0e, 0x30, 0x0c, 0x06, 0x03, 0x55, 0x04, 0x08, 0x0c, 0x05, 0x53, 0x65, 0x6f, 0x75, 0x6c, 0x31, 0x0e, 0x30, 0x0c, 0x06, 0x03, 0x55, 0x04, 0x07, 0x0c, 0x05, 0x53, 0x65, 0x6f, 0x75, 0x6c, 0x31, 0x1c, 0x30, 0x1a, 0x06, 0x03, 0x55, 0x04, 0x0a, 0x0c, 0x13, 0x4c, 0x47, 0x20, 0x45, 0x6c, 0x65, 0x63, 0x74, 0x72, 0x6f, 0x6e, 0x69, 0x63, 0x73, 0x20, 0x49, 0x6e, 0x63, 0x2e, 0x31, 0x16, 0x30, 0x14, 0x06, 0x03, 0x55, 0x04, 0x0b, 0x0c, 0x0d, 0x48, 0x45, 0x20, 0x4c, 0x61, 0x62, 0x6f, 0x72, 0x61, 0x74, 0x6f, 0x72, 0x79, 0x31, 0x1c, 0x30, 0x1a, 0x06, 0x03, 0x55, 0x04, 0x03, 0x0c, 0x13, 0x4c, 0x47, 0x20, 0x77, 0x65, 0x62, 0x4f, 0x53, 0x20, 0x54, 0x56, 0x20, 0x52, 0x6f, 0x6f, 0x74, 0x20, 0x43, 0x41, 0x31, 0x24, 0x30, 0x22, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x01, 0x16, 0x15, 0x73, 0x65, 0x63, 0x75, 0x72, 0x69, 0x74, 0x79, 0x2d, 0x70, 0x61, 0x72, 0x74, 0x40, 0x6c, 0x67, 0x65, 0x2e, 0x63, 0x6f, 0x6d, 0x30, 0x1e, 0x17, 0x0d, 0x31, 0x38, 0x30, 0x33, 0x31, 0x32, 0x30, 0x31, 0x33, 0x30, 0x32, 0x38, 0x5a, 0x17, 0x0d, 0x33, 0x34, 0x30, 0x38, 0x31, 0x35, 0x30, 0x31, 0x33, 0x30, 0x32, 0x38, 0x5a, 0x30, 0x6f, 0x31, 0x0b, 0x30, 0x09, 0x06, 0x03, 0x55, 0x04, 0x06, 0x13, 0x02, 0x4b, 0x52, 0x31, 0x0e, 0x30, 0x0c, 0x06, 0x03, 0x55, 0x04, 0x08, 0x0c, 0x05, 0x53, 0x65, 0x6f, 0x75, 0x6c, 0x31, 0x1c, 0x30, 0x1a, 0x06, 0x03, 0x55, 0x04, 0x0a, 0x0c, 0x13, 0x4c, 0x47, 0x20, 0x45, 0x6c, 0x65, 0x63, 0x74, 0x72, 0x6f, 0x6e, 0x69, 0x63, 0x73, 0x20, 0x49, 0x6e, 0x63, 0x2e, 0x31, 0x10, 0x30, 0x0e, 0x06, 0x03, 0x55, 0x04, 0x0b, 0x0c, 0x07, 0x48, 0x45, 0x20, 0x4c, 0x61, 0x62, 0x2e, 0x31, 0x20, 0x30, 0x1e, 0x06, 0x03, 0x55, 0x04, 0x03, 0x0c, 0x17, 0x4c, 0x47, 0x45, 0x20, 0x53, 0x53, 0x47, 0x20, 0x49, 0x6e, 0x74, 0x65, 0x72, 0x6d, 0x65, 0x64, 0x69, 0x61, 0x74, 0x65, 0x20, 0x43, 0x41, 0x30, 0x82, 0x02, 0x22, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x02, 0x0f, 0x00, 0x30, 0x82, 0x02, 0x0a, 0x02, 0x82, 0x02, 0x01, 0x00, 0xe5, 0xe7, 0x17, 0x8d, 0xf9, 0x49, 0x0a, 0xc9, 0xf1, 0xe2, 0x7c, 0x81, 0xad, 0x3b, 0x88, 0xa0, 0xb2, 0x5f, 0xd4, 0xc5, 0x7a, 0x2c, 0x43, 0x4a, 0x9e, 0x00, 0xc6, 0x9d, 0x0d, 0x27, 0x48, 0xf1, 0x72, 0xc7, 0x02, 0xc7, 0xc4, 0x9e, 0x50, 0x83, 0x55, 0x6c, 0x18, 0x48, 0x50, 0xfb, 0xe8, 0x0e, 0xfe, 0x18, 0xee, 0xa6, 0xb6, 0xd3, 0x79, 0x31, 0x39, 0x6c, 0x75, 0x52, 0x4f, 0x43, 0xf9, 0x72, 0xcb, 0x4d, 0xf6, 0x70, 0xf9, 0x33, 0xdf, 0xc4, 0x7d, 0x30, 0x74, 0xba, 0xb0, 0xec, 0x6a, 0x38, 0x25, 0xee, 0xae, 0x45, 0xf4, 0xc0, 0xdf, 0xfb, 0x7d, 0x33, 0x83, 0x29, 0x59, 0x12, 0xfd, 0x0d, 0xdd, 0x0a, 0xa6, 0x33, 0x7a, 0x5b, 0x96, 0x68, 0xca, 0xd9, 0x40, 0x10, 0x16, 0xea, 0xf1, 0x90, 0x56, 0x0a, 0x22, 0x94, 0x1c, 0x5f, 0xe5, 0x9f, 0x63, 0xa5, 0x5f, 0x43, 0x8f, 0xa2, 0x31, 0x5d, 0x38, 0x68, 0x99, 0x49, 0x72, 0x33, 0xc1, 0xd5, 0x09, 0x69, 0xa0, 0xdf, 0xc7, 0xa1, 0xb7, 0xc2, 0x2d, 0x8a, 0xe4, 0x9e, 0xd4, 0x1c, 0xe9, 0xaf, 0xc0, 0x6a, 0xbf, 0x7e, 0x70, 0x2c, 0x49, 0xcf, 0x3c, 0xad, 0x50, 0x84, 0xab, 0xbd, 0xa3, 0x15, 0x35, 0xd0, 0x64, 0xba, 0x62, 0x7d, 0x46, 0x35, 0x0e, 0xb1, 0x32, 0xfa, 0x5a, 0xc9, 0xfd, 0x63, 0x3e, 0xe4, 0x4a, 0xe3, 0x8d, 0xed, 0x75, 0x1f, 0x88, 0x03, 0x69, 0x83, 0xcb, 0xf3, 0x7c, 0x87, 0xad, 0xb7, 0xca, 0xf2, 0x1b, 0x07, 0x13, 0x2d, 0xfe, 0xb2, 0xe6, 0xbf, 0x38, 0xd6, 0x7a, 0xf2, 0xc2, 0xf3, 0x0c, 0x93, 0x96, 0xb1, 0x30, 0xe5, 0xe8, 0xbf, 0x18, 0xe7, 0xcc, 0x94, 0x9a, 0xbc, 0x7c, 0xad, 0xd3, 0x2b, 0x54, 0xbd, 0x08, 0xca, 0xaa, 0x7b, 0xab, 0x92, 0x3b, 0xd6, 0x07, 0x26, 0x8e, 0x7f, 0x89, 0xb8, 0x3e, 0x68, 0x52, 0xa4, 0x24, 0x40, 0xce, 0xe1, 0x13, 0x73, 0x2b, 0x65, 0xb4, 0x03, 0xb1, 0x7e, 0x6b, 0x67, 0x89, 0x22, 0x4f, 0x25, 0xcf, 0x8f, 0x6b, 0xbd, 0x93, 0x42, 0xf9, 0x7f, 0xf0, 0x69, 0x15, 0x1f, 0xb2, 0x8f, 0x18, 0xac, 0x07, 0x17, 0xbd, 0x0a, 0x38, 0x11, 0xb6, 0x03, 0x59, 0x39, 0x45, 0x0c, 0xd6, 0xb5, 0xe6, 0xb6, 0x22, 0x64, 0x41, 0x37, 0x97, 0x3a, 0x91, 0x3a, 0xda, 0x38, 0xe3, 0x45, 0x9b, 0xea, 0xfe, 0x59, 0x6a, 0xfc, 0xaf, 0x91, 0x1c, 0x90, 0x6d, 0x43, 0x5b, 0xa1, 0xd5, 0x21, 0xe3, 0x65, 0xaf, 0xa3, 0xad, 0x7a, 0x90, 0x3e, 0x86, 0x1b, 0x9f, 0xcb, 0x7b, 0x54, 0x14, 0xa4, 0xee, 0x88, 0xeb, 0xa1, 0xe3, 0xb3, 0x43, 0x32, 0x25, 0x00, 0x29, 0x16, 0xe3, 0x91, 0xd8, 0xe6, 0x61, 0x4b, 0xc1, 0x63, 0x1c, 0xf4, 0x4e, 0x35, 0x23, 0x59, 0x26, 0x5d, 0x6b, 0x00, 0xfe, 0xf1, 0xb5, 0x9e, 0xdf, 0x0e, 0x29, 0x1a, 0x77, 0x4a, 0x2a, 0x53, 0xd8, 0x47, 0x28, 0xe2, 0x90, 0x49, 0xbf, 0x1e, 0xf1, 0x04, 0xcb, 0x53, 0x24, 0x06, 0x09, 0x6d, 0x7b, 0x14, 0x1f, 0x29, 0x80, 0x2f, 0x03, 0xbb, 0xb6, 0x59, 0xaa, 0xe4, 0x54, 0xff, 0x44, 0x61, 0x2b, 0x4d, 0x36, 0xc8, 0x47, 0x65, 0x59, 0x8f, 0xb2, 0x0d, 0x6b, 0x35, 0xf1, 0xa2, 0xea, 0x2a, 0x5e, 0xb8, 0x3f, 0x91, 0xa2, 0x8a, 0x96, 0x2e, 0x7d, 0x14, 0xd6, 0x55, 0x2d, 0xc4, 0xbf, 0xc7, 0xb8, 0x5b, 0xfc, 0x9c, 0x74, 0x8d, 0xe7, 0xe2, 0x03, 0x96, 0x34, 0x05, 0x2e, 0x1d, 0x49, 0x0e, 0xf8, 0xb4, 0x57, 0xc6, 0x6d, 0x5f, 0x8a, 0x63, 0xd5, 0xd6, 0xb8, 0xa0, 0x42, 0xbb, 0x61, 0xf4, 0xab, 0x51, 0x73, 0x58, 0x3d, 0x16, 0xc0, 0xeb, 0xfa, 0xcd, 0x99, 0x7f, 0x13, 0xdf, 0xb7, 0x72, 0xd3, 0xa3, 0x3b, 0x75, 0x1d, 0x14, 0x81, 0x79, 0x02, 0x03, 0x01, 0x00, 0x01, 0xa3, 0x66, 0x30, 0x64, 0x30, 0x1d, 0x06, 0x03, 0x55, 0x1d, 0x0e, 0x04, 0x16, 0x04, 0x14, 0x2c, 0x8b, 0x60, 0xee, 0xfa, 0xa3, 0x06, 0x98, 0xb8, 0x23, 0x82, 0x68, 0x72, 0x69, 0x57, 0x88, 0x2b, 0x2d, 0x97, 0xdd, 0x30, 0x1f, 0x06, 0x03, 0x55, 0x1d, 0x23, 0x04, 0x18, 0x30, 0x16, 0x80, 0x14, 0x60, 0x90, 0x81, 0x60, 0xfb, 0xc2, 0x09, 0x4c, 0x72, 0x38, 0xd2, 0x9a, 0x88, 0xb4, 0x78, 0x6d, 0xe4, 0x98, 0xb3, 0xf8, 0x30, 0x12, 0x06, 0x03, 0x55, 0x1d, 0x13, 0x01, 0x01, 0xff, 0x04, 0x08, 0x30, 0x06, 0x01, 0x01, 0xff, 0x02, 0x01, 0x00, 0x30, 0x0e, 0x06, 0x03, 0x55, 0x1d, 0x0f, 0x01, 0x01, 0xff, 0x04, 0x04, 0x03, 0x02, 0x01, 0x86, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b, 0x05, 0x00, 0x03, 0x82, 0x02, 0x01, 0x00, 0x4a, 0x32, 0x37, 0x6d, 0xff, 0x67, 0xee, 0xb7, 0x7a, 0x36, 0x29, 0x06, 0x92, 0x77, 0x5f, 0x3a, 0x30, 0x7f, 0x70, 0x84, 0x53, 0xbb, 0xcd, 0xd4, 0x9e, 0xd0, 0xaf, 0x12, 0xc9, 0x37, 0xe8, 0x49, 0x87, 0x61, 0xa8, 0x7f, 0xf3, 0x4e, 0xea, 0x9f, 0x6f, 0xd1, 0x11, 0x28, 0x35, 0xe4, 0x23, 0x54, 0xa5, 0xdb, 0x77, 0xcc, 0x9c, 0x36, 0x93, 0xa5, 0xe5, 0x26, 0x3a, 0xdb, 0x45, 0xc5, 0x8a, 0x9e, 0x85, 0xfa, 0x02, 0xc6, 0xc6, 0x54, 0xd1, 0xcb, 0x62, 0xd7, 0xec, 0x15, 0x29, 0x63, 0x00, 0x87, 0xa0, 0x0b, 0x83, 0xcd, 0x27, 0x51, 0x8b, 0xb6, 0xe1, 0xaa, 0x67, 0x70, 0x49, 0x92, 0xfb, 0x54, 0x6c, 0x26, 0xe1, 0x12, 0x06, 0xa5, 0xe5, 0x16, 0x36, 0xac, 0x76, 0x60, 0x7f, 0x31, 0x80, 0x9e, 0xd9, 0x6f, 0x8b, 0xf4, 0x2c, 0x27, 0x02, 0x0e, 0xca, 0x81, 0xd4, 0x97, 0x68, 0x6f, 0x10, 0x75, 0x50, 0xb6, 0xc1, 0x65, 0x0f, 0xfc, 0x06, 0xcb, 0x84, 0x8e, 0x25, 0xa7, 0x5a, 0x0d, 0x27, 0x4c, 0x3c, 0xfb, 0x55, 0x99, 0xa9, 0x3f, 0x57, 0xce, 0xb3, 0x8b, 0xcb, 0x60, 0xfc, 0xc5, 0x57, 0x3a, 0xb4, 0xed, 0x0f, 0x5a, 0xbf, 0x16, 0x21, 0xeb, 0x8d, 0x89, 0x2e, 0xc8, 0x61, 0x55, 0x9f, 0x7f, 0x57, 0x05, 0x8b, 0xab, 0x9b, 0x86, 0x5c, 0xda, 0xf1, 0xae, 0xf4, 0x4d, 0xaf, 0x82, 0x51, 0xe5, 0xe9, 0x9a, 0xc7, 0xd1, 0xd5, 0xfe, 0x8f, 0x8b, 0x2b, 0xd1, 0x5d, 0x50, 0xfe, 0x57, 0x25, 0x61, 0x17, 0x79, 0x74, 0x91, 0x4a, 0xf0, 0x98, 0x87, 0xb7, 0x63, 0xb6, 0x44, 0x2a, 0xcd, 0xc9, 0x8b, 0x75, 0x3e, 0x31, 0xcd, 0x4e, 0x9c, 0x84, 0x93, 0x2e, 0x08, 0x90, 0x06, 0xea, 0xac, 0xef, 0xf2, 0xbe, 0xc4, 0x03, 0x42, 0x2b, 0x6d, 0x69, 0x39, 0xa0, 0x18, 0x71, 0x35, 0xeb, 0x7f, 0x70, 0x21, 0x31, 0x21, 0x41, 0xff, 0x46, 0xa8, 0xaf, 0x71, 0xf6, 0xbb, 0xa8, 0xf4, 0xec, 0x4d, 0x85, 0x52, 0xa0, 0xce, 0x49, 0x77, 0x0d, 0xa8, 0x72, 0x21, 0x13, 0xea, 0xf7, 0x36, 0x52, 0x66, 0x33, 0x06, 0x21, 0xd5, 0xdb, 0x61, 0x33, 0xd3, 0x66, 0xb2, 0x74, 0xe4, 0xa6, 0x2f, 0x85, 0x64, 0x75, 0x1f, 0xa7, 0x83, 0x11, 0x93, 0x68, 0x29, 0x04, 0x0c, 0x1a, 0x47, 0x3c, 0xb0, 0xda, 0x67, 0xa6, 0x33, 0xa7, 0xfc, 0x41, 0x80, 0x21, 0xa4, 0xbc, 0xbe, 0x35, 0xec, 0x1d, 0xeb, 0x4e, 0xe0, 0x6f, 0x0f, 0x66, 0x18, 0xc1, 0x0d, 0xa9, 0x49, 0x2f, 0x4e, 0xe4, 0xdd, 0x05, 0x38, 0xb1, 0x63, 0x5f, 0x72, 0xf7, 0x77, 0xd8, 0xb1, 0x95, 0x7c, 0x2a, 0x5a, 0x2d, 0x3b, 0xc3, 0xbf, 0x58, 0x38, 0xd8, 0xcb, 0xaa, 0x36, 0x26, 0xe8, 0xea, 0xd8, 0xa7, 0x9c, 0x6d, 0x8a, 0x76, 0x6b, 0xc4, 0x41, 0x1c, 0x76, 0xef, 0xe3, 0xb7, 0x4a, 0x52, 0x3a, 0x46, 0x15, 0x1b, 0xe3, 0x44, 0x83, 0xe9, 0x1c, 0x2e, 0x24, 0x69, 0xc7, 0x2e, 0x2a, 0xec, 0x0d, 0xef, 0x56, 0x59, 0x51, 0x11, 0xb2, 0xd9, 0x2f, 0xa4, 0x7f, 0xe4, 0x6d, 0xc3, 0xba, 0x54, 0xd1, 0x98, 0x80, 0x9a, 0x8a, 0x52, 0x4d, 0xdc, 0xf1, 0x7e, 0xe5, 0x86, 0xaf, 0x69, 0x02, 0x36, 0x1f, 0xac, 0x91, 0x76, 0x2c, 0x36, 0x38, 0xcc, 0xda, 0x2e, 0x01, 0xf0, 0xdf, 0x35, 0x3d, 0x34, 0x63, 0x78, 0xde, 0x63, 0x08, 0xd6, 0xad, 0x58, 0x97, 0x83, 0xd8, 0x03, 0x6b, 0x0e, 0xa8, 0x79, 0x1a, 0x71, 0xea, 0x12, 0x00, 0xbe, 0xc2, 0x68, 0x2d, 0x99, 0xbc, 0x8e, 0x75, 0x2b, 0xcf, 0x1e, 0x91, 0x47, 0xea, 0x0b, 0x7e, 0x0b, 0xdb, 0x48, 0x62, 0x65, 0x2f, 0x24, 0x2e, 0xd1, 0x37, 0x04, 0xb4, 0xbf, 0xa2, 0x5a, 0x8c, 0xb3, 0x2b, 0x80, 0x9c, 0x17, 0x3e
};


static NSString *sLastDomain = nil;
static BOOL sLastValidationSuccess = NO;
static NSString *sLastLeafSummary = nil;
static NSString *sLastLeafFingerprint = nil;
static NSString *sLastErrorDomain = nil;
static NSInteger sLastErrorCode = 0;
static NSString *sLastErrorDescription = nil;

static NSString *SHA256Fingerprint(SecCertificateRef cert) {
  if (!cert) return @"";
  CFDataRef certData = SecCertificateCopyData(cert);
  if (!certData) return @"";
  const uint8_t *bytes = CFDataGetBytePtr(certData);
  CFIndex length = CFDataGetLength(certData);

  uint8_t digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(bytes, (CC_LONG)length, digest);
  CFRelease(certData);

  NSMutableString *hex = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
  for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) {
    [hex appendFormat:@"%02X", digest[i]];
  }
  return hex;
}

@implementation LGWebSocketSecurityPolicy

- (instancetype)init {
  // Disable default CFStream system-root validation so evaluateServerTrust:forDomain:
  // receives the SecTrustRef to validate against our anchored LG CA.
  self = [super initWithCertificateChainValidationEnabled:NO];
  return self;
}

+ (instancetype)policyForLGTV {
  static LGWebSocketSecurityPolicy *policy;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    policy = [[self alloc] init];
  });
  return policy;
}

+ (nullable SecCertificateRef)lgIntermediateCACertificate {
  static SecCertificateRef certRef = NULL;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    NSData *data = [NSData dataWithBytes:lg_intermediate_ca_der length:sizeof(lg_intermediate_ca_der)];
    certRef = SecCertificateCreateWithData(NULL, (__bridge CFDataRef)data);
  });
  return certRef;
}

- (void)updateSecurityOptionsInStream:(NSStream *)stream {
  [super updateSecurityOptionsInStream:stream];
  NSLog(@"[SmartRemote][NativeWS][SocketRocket] updateSecurityOptionsInStream called for stream: %@", stream);
  // Explicitly inform CoreFoundation stream not to auto-validate against system roots.
  NSDictionary *sslOptions = @{
    (__bridge NSString *)kCFStreamSSLValidatesCertificateChain: @NO,
  };
  [stream setProperty:sslOptions forKey:(__bridge NSString *)kCFStreamPropertySSLSettings];
}

- (BOOL)evaluateServerTrust:(SecTrustRef)serverTrust forDomain:(NSString *)domain {
  NSLog(@"[SmartRemote][NativeWS][SocketRocket] evaluateServerTrust:forDomain: invoked for domain: %@", domain);
  if (!serverTrust) {
    [LGTVTLSModule recordTLSStatus:domain success:NO leafCert:NULL error:NULL];
    return NO;
  }

  // 1. Inspect leaf certificate presented by the server
  SecCertificateRef leafCert = NULL;
  if (@available(iOS 15.0, *)) {
    CFArrayRef chain = SecTrustCopyCertificateChain(serverTrust);
    if (chain && CFArrayGetCount(chain) > 0) {
      leafCert = (SecCertificateRef)CFArrayGetValueAtIndex(chain, 0);
      CFRetain(leafCert);
      CFRelease(chain);
    }
  } else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    leafCert = SecTrustGetCertificateAtIndex(serverTrust, 0);
    if (leafCert) CFRetain(leafCert);
#pragma clang diagnostic pop
  }

  if (!leafCert) {
    NSLog(@"[SmartRemote][NativeWS][SocketRocket] Validation failed: empty certificate chain for %@", domain);
    [LGTVTLSModule recordTLSStatus:domain success:NO leafCert:NULL error:NULL];
    return NO;
  }

  CFStringRef summaryRef = SecCertificateCopySubjectSummary(leafCert);
  NSString *leafSummary = summaryRef ? (__bridge_transfer NSString *)summaryRef : @"";

  // Must match LG TV identity
  BOOL isLGLeaf = [leafSummary isEqualToString:@"LGE TV SSG"] ||
                  [leafSummary containsString:@"LGE TV"] ||
                  [leafSummary containsString:@"LG webOS"];
  if (!isLGLeaf) {
    NSLog(@"[SmartRemote][NativeWS][SocketRocket] Validation rejected: unexpected certificate subject '%@' for %@", leafSummary, domain);
    [LGTVTLSModule recordTLSStatus:domain success:NO leafCert:leafCert error:NULL];
    CFRelease(leafCert);
    return NO;
  }

  // 2. Set evaluation policy to basic X.509
  SecPolicyRef policy = SecPolicyCreateBasicX509();
  SecTrustSetPolicies(serverTrust, policy);
  CFRelease(policy);

  // 3. Set trusted anchor strictly to LG Intermediate CA
  SecCertificateRef lgAnchor = [LGWebSocketSecurityPolicy lgIntermediateCACertificate];
  if (!lgAnchor) {
    NSLog(@"[SmartRemote][NativeWS][SocketRocket] Validation failed: could not load LG anchor certificate");
    [LGTVTLSModule recordTLSStatus:domain success:NO leafCert:leafCert error:NULL];
    CFRelease(leafCert);
    return NO;
  }

  NSArray *anchors = @[ (__bridge id)lgAnchor ];
  SecTrustSetAnchorCertificates(serverTrust, (__bridge CFArrayRef)anchors);
  SecTrustSetAnchorCertificatesOnly(serverTrust, true);

  // 4. Perform cryptographic trust chain evaluation
  CFErrorRef error = NULL;
  bool trusted = SecTrustEvaluateWithError(serverTrust, &error);

  [LGTVTLSModule recordTLSStatus:domain success:trusted leafCert:leafCert error:error];
  CFRelease(leafCert);

  if (trusted) {
    NSLog(@"[SmartRemote][NativeWS][SocketRocket] Cryptographic TLS verification SUCCEEDED for LG TV at %@ (Subject: %@)", domain, leafSummary);
    return YES;
  } else {
    NSLog(@"[SmartRemote][NativeWS][SocketRocket] Cryptographic TLS verification FAILED for LG TV at %@: %@", domain, error);
    if (error) CFRelease(error);
    return NO;
  }
}

+ (void)load {
  NSLog(@"[SmartRemote][NativeWS][SocketRocket] LGWebSocketSecurityPolicy +load executed. Registering custom SRWebSocketProvider.");
  RCTSetCustomSRWebSocketProvider(^SRWebSocket *(NSURLRequest *request) {
    NSURL *url = request.URL;
    if (!url) {
      return nil;
    }

    NSString *scheme = url.scheme.lowercaseString;
    NSNumber *port = url.port;

    NSLog(@"[SmartRemote][NativeWS][SocketRocket] Custom SRWebSocketProvider block invoked for: %@", url.absoluteString);

    // Intercept secure WebSocket connections to LG TV port (3001)
    if ([scheme isEqualToString:@"wss"] && port != nil && [port intValue] == 3001) {
      NSLog(@"[SmartRemote][NativeWS][SocketRocket] Providing SRWebSocket with LGWebSocketSecurityPolicy for %@", url.absoluteString);
      LGWebSocketSecurityPolicy *policy = [LGWebSocketSecurityPolicy policyForLGTV];
      return [[SRWebSocket alloc] initWithURLRequest:request protocols:nil securityPolicy:policy];
    }

    // Default React Native SRWebSocket for Metro, devtools, and standard WebSockets
    return nil;
  });
}

@end

@interface LGProbeDelegate : NSObject <NSURLSessionDelegate>
@property (nonatomic, copy) void (^completion)(NSDictionary *);
@end

@implementation LGProbeDelegate

- (instancetype)initWithCompletion:(void (^)(NSDictionary *))completion {
  self = [super init];
  if (self) {
    _completion = [completion copy];
  }
  return self;
}

- (void)URLSession:(NSURLSession *)session
didReceiveChallenge:(NSURLAuthenticationChallenge *)challenge
 completionHandler:(void (^)(NSURLSessionAuthChallengeDisposition disposition, NSURLCredential * _Nullable credential))completionHandler
{
  SecTrustRef trust = challenge.protectionSpace.serverTrust;
  NSString *host = challenge.protectionSpace.host;
  NSInteger port = challenge.protectionSpace.port;

  if (!trust) {
    if (self.completion) {
      self.completion(@{
        @"reachable": @YES,
        @"tlsHandshakeSuccess": @NO,
        @"error": @"No server trust provided in challenge",
        @"host": host ?: @"",
        @"port": @(port)
      });
    }
    completionHandler(NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil);
    return;
  }

  // 1. Check system CA evaluation
  CFErrorRef sysError = NULL;
  bool systemTrusted = SecTrustEvaluateWithError(trust, &sysError);

  // 2. Extract leaf info
  SecCertificateRef leaf = NULL;
  if (@available(iOS 15.0, *)) {
    CFArrayRef chain = SecTrustCopyCertificateChain(trust);
    if (chain && CFArrayGetCount(chain) > 0) {
      leaf = (SecCertificateRef)CFArrayGetValueAtIndex(chain, 0);
      CFRetain(leaf);
      CFRelease(chain);
    }
  }

  NSString *leafSummary = leaf ? (__bridge_transfer NSString *)SecCertificateCopySubjectSummary(leaf) : @"";
  NSString *fingerprint = leaf ? SHA256Fingerprint(leaf) : @"";
  if (leaf) CFRelease(leaf);

  // 3. Evaluate against LG anchor
  SecPolicyRef basicPolicy = SecPolicyCreateBasicX509();
  SecTrustSetPolicies(trust, basicPolicy);
  CFRelease(basicPolicy);

  SecCertificateRef lgAnchor = [LGWebSocketSecurityPolicy lgIntermediateCACertificate];
  if (lgAnchor) {
    SecTrustSetAnchorCertificates(trust, (__bridge CFArrayRef)@[ (__bridge id)lgAnchor ]);
    SecTrustSetAnchorCertificatesOnly(trust, true);
  }

  CFErrorRef lgError = NULL;
  bool lgTrusted = SecTrustEvaluateWithError(trust, &lgError);

  NSDictionary *res = @{
    @"reachable": @YES,
    @"host": host ?: @"",
    @"port": @(port),
    @"leafSubject": leafSummary ?: @"",
    @"fingerprint": fingerprint ?: @"",
    @"systemTrusted": @(systemTrusted),
    @"systemError": sysError ? (__bridge_transfer NSString *)CFErrorCopyDescription(sysError) : @"None",
    @"trustedByLGCA": @(lgTrusted),
    @"lgError": lgError ? (__bridge_transfer NSString *)CFErrorCopyDescription(lgError) : @"None"
  };

  if (self.completion) {
    self.completion(res);
  }

  // Cancel challenge since this is a probe only
  completionHandler(NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil);
}

@end

@implementation LGTVTLSModule

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

+ (void)recordTLSStatus:(NSString *)domain
                success:(BOOL)success
               leafCert:(nullable SecCertificateRef)leafCert
                  error:(nullable CFErrorRef)error
{
  sLastDomain = [domain copy];
  sLastValidationSuccess = success;
  if (leafCert) {
    CFStringRef summaryRef = SecCertificateCopySubjectSummary(leafCert);
    sLastLeafSummary = summaryRef ? (__bridge_transfer NSString *)summaryRef : @"";
    sLastLeafFingerprint = SHA256Fingerprint(leafCert);
  } else {
    sLastLeafSummary = @"";
    sLastLeafFingerprint = @"";
  }

  if (error) {
    CFStringRef errDomain = CFErrorGetDomain(error);
    sLastErrorDomain = errDomain ? (__bridge_transfer NSString *)CFStringCreateCopy(NULL, errDomain) : @"";
    sLastErrorCode = CFErrorGetCode(error);
    CFStringRef desc = CFErrorCopyDescription(error);
    sLastErrorDescription = desc ? (__bridge_transfer NSString *)desc : @"";
  } else {
    sLastErrorDomain = @"";
    sLastErrorCode = 0;
    sLastErrorDescription = @"";
  }
}

RCT_EXPORT_METHOD(getLastTLSStatus:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@{
    @"domain": sLastDomain ?: @"",
    @"validationSuccess": @(sLastValidationSuccess),
    @"leafSummary": sLastLeafSummary ?: @"",
    @"leafFingerprint": sLastLeafFingerprint ?: @"",
    @"errorDomain": sLastErrorDomain ?: @"",
    @"errorCode": @(sLastErrorCode),
    @"errorDescription": sLastErrorDescription ?: @""
  });
}

RCT_EXPORT_METHOD(probeEndpoint:(NSString *)host
                           port:(nonnull NSNumber *)port
                       resolver:(RCTPromiseResolveBlock)resolve
                       rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    NSURL *url = [NSURL URLWithString:[NSString stringWithFormat:@"https://%@:%@/", host, port]];
    NSURLSessionConfiguration *config = [NSURLSessionConfiguration ephemeralSessionConfiguration];
    config.timeoutIntervalForRequest = 4.0;
    config.timeoutIntervalForResource = 4.0;

    __block BOOL completed = NO;
    __block NSDictionary *resultDict = nil;

    LGProbeDelegate *delegate = [[LGProbeDelegate alloc] initWithCompletion:^(NSDictionary *res) {
      if (!completed) {
        completed = YES;
        resultDict = res;
      }
    }];

    NSURLSession *session = [NSURLSession sessionWithConfiguration:config delegate:delegate delegateQueue:nil];
    NSURLSessionDataTask *task = [session dataTaskWithURL:url completionHandler:^(NSData *d, NSURLResponse *r, NSError *e) {
      // Completed or failed
    }];
    [task resume];

    NSTimeInterval start = [NSDate timeIntervalSinceReferenceDate];
    while (!completed && ([NSDate timeIntervalSinceReferenceDate] - start < 4.5)) {
      [NSThread sleepForTimeInterval:0.1];
    }
    [session invalidateAndCancel];

    if (resultDict) {
      resolve(resultDict);
    } else {
      resolve(@{
        @"reachable": @NO,
        @"host": host,
        @"port": port,
        @"error": @"Endpoint probe timed out"
      });
    }
  });
}

@end

#pragma mark - LGNativeWebSocketModule Implementation

@implementation LGNativeWebSocketModule {
  NSMutableDictionary<NSNumber *, NSURLSession *> *_sessions;
  NSMutableDictionary<NSNumber *, NSURLSessionWebSocketTask *> *_tasks;
  NSMutableDictionary<NSNumber *, NSNumber *> *_isOpenMap;
  NSInteger _listenerCount;
}

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _sessions = [NSMutableDictionary dictionary];
    _tasks = [NSMutableDictionary dictionary];
    _isOpenMap = [NSMutableDictionary dictionary];
    _listenerCount = 0;
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"onLGWebSocketOpen",
    @"onLGWebSocketMessage",
    @"onLGWebSocketError",
    @"onLGWebSocketClosed"
  ];
}

- (void)startObserving {
  _listenerCount++;
}

- (void)stopObserving {
  _listenerCount--;
  if (_listenerCount < 0) {
    _listenerCount = 0;
  }
}

- (void)safeSendEvent:(NSString *)name body:(id)body {
  if (self.bridge != nil && _listenerCount > 0) {
    [self sendEventWithName:name body:body];
  }
}

- (nullable NSNumber *)socketIDForTask:(NSURLSessionWebSocketTask *)task {
  @synchronized(self) {
    for (NSNumber *key in _tasks) {
      if (_tasks[key] == task) {
        return key;
      }
    }
  }
  return nil;
}

- (void)cleanupSocketID:(NSNumber *)socketID {
  @synchronized(self) {
    NSURLSession *session = _sessions[socketID];
    [_sessions removeObjectForKey:socketID];
    [_tasks removeObjectForKey:socketID];
    [_isOpenMap removeObjectForKey:socketID];
    if (session) {
      [session invalidateAndCancel];
    }
  }
}

RCT_EXPORT_METHOD(connect:(nonnull NSNumber *)socketID urlString:(NSString *)urlString) {
  NSLog(@"[SmartRemote][NativeWS][NSURLSession] connect requested for socketID: %ld, URL: %@", (long)[socketID integerValue], urlString);
  NSURL *url = [NSURL URLWithString:urlString];
  if (!url) {
    [self safeSendEvent:@"onLGWebSocketError" body:@{
      @"id": socketID,
      @"message": [NSString stringWithFormat:@"Invalid WebSocket URL: %@", urlString]
    }];
    [self safeSendEvent:@"onLGWebSocketClosed" body:@{
      @"id": socketID,
      @"code": @(1006),
      @"reason": @"Invalid WebSocket URL"
    }];
    return;
  }

  NSURLSessionConfiguration *config = [NSURLSessionConfiguration defaultSessionConfiguration];
  config.timeoutIntervalForRequest = 10.0;
  config.timeoutIntervalForResource = 30.0;

  NSOperationQueue *queue = [[NSOperationQueue alloc] init];
  queue.maxConcurrentOperationCount = 1;

  NSURLSession *session = [NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:queue];
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];

  NSURLSessionWebSocketTask *task = [session webSocketTaskWithRequest:request];

  @synchronized(self) {
    _sessions[socketID] = session;
    _tasks[socketID] = task;
    _isOpenMap[socketID] = @NO;
  }

  [task resume];
  [self listenForMessagesOnTask:task socketID:socketID];
}

- (void)listenForMessagesOnTask:(NSURLSessionWebSocketTask *)task socketID:(NSNumber *)socketID {
  __weak typeof(self) weakSelf = self;
  [task receiveMessageWithCompletionHandler:^(NSURLSessionWebSocketMessage * _Nullable message, NSError * _Nullable error) {
    __strong typeof(weakSelf) strongSelf = weakSelf;
    if (!strongSelf) return;

    if (error) {
      // The session/task delegate didCompleteWithError will handle closure
      return;
    }

    if (message.type == NSURLSessionWebSocketMessageTypeString) {
      [strongSelf safeSendEvent:@"onLGWebSocketMessage" body:@{
        @"id": socketID,
        @"data": message.string ?: @""
      }];
    } else if (message.type == NSURLSessionWebSocketMessageTypeData) {
      NSString *base64 = [message.data base64EncodedStringWithOptions:0];
      [strongSelf safeSendEvent:@"onLGWebSocketMessage" body:@{
        @"id": socketID,
        @"data": base64 ?: @""
      }];
    }

    [strongSelf listenForMessagesOnTask:task socketID:socketID];
  }];
}

RCT_EXPORT_METHOD(send:(nonnull NSNumber *)socketID message:(NSString *)message) {
  NSURLSessionWebSocketTask *task = nil;
  @synchronized(self) {
    task = _tasks[socketID];
  }
  if (!task) {
    NSLog(@"[SmartRemote][NativeWS][NSURLSession] send: socketID %ld not found", (long)[socketID integerValue]);
    return;
  }
  NSURLSessionWebSocketMessage *wsMessage = [[NSURLSessionWebSocketMessage alloc] initWithString:message];
  [task sendMessage:wsMessage completionHandler:^(NSError * _Nullable error) {
    if (error) {
      NSLog(@"[SmartRemote][NativeWS][NSURLSession] sendMessage failed for socketID %ld: %@", (long)[socketID integerValue], error);
    }
  }];
}

RCT_EXPORT_METHOD(close:(nonnull NSNumber *)socketID code:(nonnull NSNumber *)code reason:(nullable NSString *)reason) {
  NSLog(@"[SmartRemote][NativeWS][NSURLSession] close called for socketID %ld (code: %ld, reason: %@)",
        (long)[socketID integerValue], (long)[code integerValue], reason ?: @"");
  NSURLSessionWebSocketTask *task = nil;
  @synchronized(self) {
    task = _tasks[socketID];
  }
  if (task) {
    NSData *reasonData = reason.length > 0 ? [reason dataUsingEncoding:NSUTF8StringEncoding] : nil;
    [task cancelWithCloseCode:[code integerValue] reason:reasonData];
  }
  [self cleanupSocketID:socketID];
}

#pragma mark - NSURLSessionWebSocketDelegate

- (void)URLSession:(NSURLSession *)session
     webSocketTask:(NSURLSessionWebSocketTask *)webSocketTask
didOpenWithProtocol:(nullable NSString *)protocol
{
  NSNumber *socketID = [self socketIDForTask:webSocketTask];
  if (!socketID) return;

  @synchronized(self) {
    _isOpenMap[socketID] = @YES;
  }

  NSLog(@"[SmartRemote][NativeWS][NSURLSession] WebSocket connection OPENED for socketID %ld", (long)[socketID integerValue]);

  [self safeSendEvent:@"onLGWebSocketOpen" body:@{
    @"id": socketID
  }];
}

- (void)URLSession:(NSURLSession *)session
     webSocketTask:(NSURLSessionWebSocketTask *)webSocketTask
   didCloseWithCode:(NSURLSessionWebSocketCloseCode)closeCode
             reason:(nullable NSData *)reason
{
  NSNumber *socketID = [self socketIDForTask:webSocketTask];
  if (!socketID) return;

  NSString *reasonString = reason ? [[NSString alloc] initWithData:reason encoding:NSUTF8StringEncoding] : @"";
  NSLog(@"[SmartRemote][NativeWS][NSURLSession] WebSocket CLOSED for socketID %ld (code: %ld, reason: %@)",
        (long)[socketID integerValue], (long)closeCode, reasonString);

  [self cleanupSocketID:socketID];

  [self safeSendEvent:@"onLGWebSocketClosed" body:@{
    @"id": socketID,
    @"code": @(closeCode),
    @"reason": reasonString ?: @""
  }];
}

- (void)URLSession:(NSURLSession *)session
              task:(NSURLSessionTask *)task
didCompleteWithError:(nullable NSError *)error
{
  if (!error) return;

  NSNumber *socketID = [self socketIDForTask:(NSURLSessionWebSocketTask *)task];
  if (!socketID) return;

  BOOL wasOpen = NO;
  @synchronized(self) {
    wasOpen = [_isOpenMap[socketID] boolValue];
  }

  NSLog(@"[SmartRemote][NativeWS][NSURLSession] WebSocket task didCompleteWithError: %@ [domain: %@, code: %ld] for socketID %ld (wasOpen=%d)",
        error.localizedDescription, error.domain, (long)error.code, (long)[socketID integerValue], wasOpen);

  [self cleanupSocketID:socketID];

  [self safeSendEvent:@"onLGWebSocketError" body:@{
    @"id": socketID,
    @"message": error.localizedDescription ?: @"WebSocket connection failed",
    @"code": @(error.code),
    @"domain": error.domain ?: @""
  }];

  [self safeSendEvent:@"onLGWebSocketClosed" body:@{
    @"id": socketID,
    @"code": @(1006),
    @"reason": error.localizedDescription ?: @"Connection terminated abnormally"
  }];
}

- (void)URLSession:(NSURLSession *)session
didReceiveChallenge:(NSURLAuthenticationChallenge *)challenge
 completionHandler:(void (^)(NSURLSessionAuthChallengeDisposition disposition, NSURLCredential * _Nullable credential))completionHandler
{
  NSString *authMethod = challenge.protectionSpace.authenticationMethod;
  if (![authMethod isEqualToString:NSURLAuthenticationMethodServerTrust]) {
    completionHandler(NSURLSessionAuthChallengePerformDefaultHandling, nil);
    return;
  }

  SecTrustRef serverTrust = challenge.protectionSpace.serverTrust;
  NSString *host = challenge.protectionSpace.host;
  NSInteger port = challenge.protectionSpace.port;

  NSLog(@"[SmartRemote][NativeWS][NSURLSession] Received TLS challenge for host: %@, port: %ld", host, (long)port);

  if (!serverTrust) {
    NSLog(@"[SmartRemote][NativeWS][NSURLSession] TLS validation failed: serverTrust is NULL");
    [LGTVTLSModule recordTLSStatus:host success:NO leafCert:NULL error:NULL];
    completionHandler(NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil);
    return;
  }

  // Only apply LG custom trust to LG TV port 3001
  if (port != 3001) {
    NSLog(@"[SmartRemote][NativeWS][NSURLSession] Port %ld != 3001; delegating to default TLS evaluation", (long)port);
    completionHandler(NSURLSessionAuthChallengePerformDefaultHandling, nil);
    return;
  }

  // 1. Inspect leaf certificate presented by the server
  SecCertificateRef leafCert = NULL;
  if (@available(iOS 15.0, *)) {
    CFArrayRef chain = SecTrustCopyCertificateChain(serverTrust);
    if (chain && CFArrayGetCount(chain) > 0) {
      leafCert = (SecCertificateRef)CFArrayGetValueAtIndex(chain, 0);
      CFRetain(leafCert);
      CFRelease(chain);
    }
  } else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    leafCert = SecTrustGetCertificateAtIndex(serverTrust, 0);
    if (leafCert) CFRetain(leafCert);
#pragma clang diagnostic pop
  }

  if (!leafCert) {
    NSLog(@"[SmartRemote][NativeWS][NSURLSession] TLS validation failed: empty certificate chain for %@", host);
    [LGTVTLSModule recordTLSStatus:host success:NO leafCert:NULL error:NULL];
    completionHandler(NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil);
    return;
  }

  CFStringRef summaryRef = SecCertificateCopySubjectSummary(leafCert);
  NSString *leafSummary = summaryRef ? (__bridge_transfer NSString *)summaryRef : @"";

  // Must match LG TV identity
  BOOL isLGLeaf = [leafSummary isEqualToString:@"LGE TV SSG"] ||
                  [leafSummary containsString:@"LGE TV"] ||
                  [leafSummary containsString:@"LG webOS"];
  if (!isLGLeaf) {
    NSLog(@"[SmartRemote][NativeWS][NSURLSession] TLS rejected: unexpected certificate subject '%@' for %@", leafSummary, host);
    [LGTVTLSModule recordTLSStatus:host success:NO leafCert:leafCert error:NULL];
    CFRelease(leafCert);
    completionHandler(NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil);
    return;
  }

  // 2. Set evaluation policy to basic X.509
  SecPolicyRef policy = SecPolicyCreateBasicX509();
  SecTrustSetPolicies(serverTrust, policy);
  CFRelease(policy);

  // 3. Set trusted anchor strictly to LG Intermediate CA
  SecCertificateRef lgAnchor = [LGWebSocketSecurityPolicy lgIntermediateCACertificate];
  if (!lgAnchor) {
    NSLog(@"[SmartRemote][NativeWS][NSURLSession] TLS validation failed: could not load LG anchor certificate");
    [LGTVTLSModule recordTLSStatus:host success:NO leafCert:leafCert error:NULL];
    CFRelease(leafCert);
    completionHandler(NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil);
    return;
  }

  NSArray *anchors = @[ (__bridge id)lgAnchor ];
  SecTrustSetAnchorCertificates(serverTrust, (__bridge CFArrayRef)anchors);
  SecTrustSetAnchorCertificatesOnly(serverTrust, true);

  // 4. Perform cryptographic trust chain evaluation
  CFErrorRef error = NULL;
  bool trusted = SecTrustEvaluateWithError(serverTrust, &error);

  [LGTVTLSModule recordTLSStatus:host success:trusted leafCert:leafCert error:error];
  CFRelease(leafCert);

  if (trusted) {
    NSLog(@"[SmartRemote][NativeWS][NSURLSession] Cryptographic TLS verification SUCCEEDED for LG TV at %@:%ld (Subject: %@)", host, (long)port, leafSummary);
    NSURLCredential *credential = [NSURLCredential credentialForTrust:serverTrust];
    completionHandler(NSURLSessionAuthChallengeUseCredential, credential);
  } else {
    NSLog(@"[SmartRemote][NativeWS][NSURLSession] Cryptographic TLS verification FAILED for LG TV at %@:%ld: %@", host, (long)port, error);
    if (error) CFRelease(error);
    completionHandler(NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil);
  }
}

@end

