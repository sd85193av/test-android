import { Workbook } from 'exceljs'
import { describe, expect, it } from 'vitest'
import { createExcelBackup, parseExcelBackup } from './excelBackup'
import type { LocalAppData } from './localDatabase'

const sampleData = (): LocalAppData => ({
  version: 1,
  products: [
    {
      id: 'product-1',
      name: '甜不辣',
      unit: '份',
      stock: '12.5',
      reorderLevel: '3',
      cost: '25.00',
      price: '50.00',
      createdAt: '2026-07-03T08:00:00.000Z',
      updatedAt: '2026-07-03T08:00:00.000Z',
    },
  ],
  movements: [
    {
      id: 'movement-1',
      orderId: 'order-1',
      type: 'sale',
      productId: 'product-1',
      productName: '甜不辣',
      unit: '份',
      quantity: '-2',
      unitPrice: '50.00',
      unitCost: '25.00',
      revenue: '100.00',
      costTotal: '50.00',
      note: '測試訂單',
      createdAt: '2026-07-03T09:00:00.000Z',
    },
  ],
  lastBackupAt: '2026-07-03T10:00:00.000Z',
})

const exactArrayBuffer = (contents: Uint8Array) => (
  contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength) as ArrayBuffer
)

describe('Excel backup conversion', () => {
  it('round-trips inventory and grouped order records', async () => {
    const contents = await createExcelBackup(sampleData())
    const restored = await parseExcelBackup(exactArrayBuffer(contents))

    expect(contents[0]).toBe(0x50)
    expect(contents[1]).toBe(0x4b)
    expect(restored.products).toHaveLength(1)
    expect(restored.products[0]).toMatchObject({
      id: 'product-1',
      name: '甜不辣',
      stock: '12.5',
      cost: '25',
    })
    expect(restored.movements[0]).toMatchObject({
      id: 'movement-1',
      orderId: 'order-1',
      type: 'sale',
      productName: '甜不辣',
      quantity: '-2',
      revenue: '100',
      note: '測試訂單',
    })
  })

  it('rejects workbooks without the required source sheets', async () => {
    const workbook = new Workbook()
    workbook.addWorksheet('其他資料')
    const contents = new Uint8Array(await workbook.xlsx.writeBuffer())

    await expect(parseExcelBackup(exactArrayBuffer(contents))).rejects.toThrow('Excel 必須包含')
  })
})
