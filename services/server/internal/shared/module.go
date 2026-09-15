// Package shared 存放跨模块基础设施。
//
// 模块纪律：
//  1. 其它业务模块只能 import 对方的 service 接口，禁止 import repo 与表结构。
//  2. 围度加解密只走 crypto.Box。
//  3. 厂商 SDK / 电商取数不得出现在业务模块 import 里。
package shared
