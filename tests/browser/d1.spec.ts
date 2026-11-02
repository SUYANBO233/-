import { test,expect,type Page } from '@playwright/test';
import { D1_FIXTURES } from '../../src/data/d1-fixtures';

async function synchronize(page:Page,mileage='K3601+200',workface='test_face_a') {
  await page.goto('/decision');
  await expect(page.getByLabel('施工工作面')).toHaveValue('test_face_a');
  if (workface !== 'test_face_a') await page.getByLabel('施工工作面').selectOption(workface);
  await page.getByLabel('开挖里程桩号').fill(mileage);
  await page.getByRole('button',{ name:'同步数据',exact:true }).click();
  await expect(page.getByRole('status').filter({ hasText:'数据来源：' })).not.toContainText('页面初始值');
}
test.beforeEach(async ({ request }) => {
  for (const code of ['test_method_iv','test_method_v','test_method_tie']) {
    expect((await request.patch('/api/knowledge/decision-catalog',{ data:{ kind:'rule',code,version:1,enabled:true } })).ok()).toBeTruthy();
  }
});

test('真实页面：同步、推荐、完整规格、微调、报告保存和历史查看',async ({ page,request },testInfo) => {
  const errors:string[]=[];
  page.on('pageerror',(error) => errors.push(error.message));
  await synchronize(page);
  await expect(page.getByLabel('隧道埋深')).toHaveValue('620');
  await expect(page.getByText('数据来源：临时测试资料',{ exact:false })).toBeVisible();
  await page.getByRole('button',{ name:'启动智能推理与决策' }).click();
  await expect(page.getByRole('button',{ name:'选择台阶法' })).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{ name:'确认工法，读取支护模板' }).click();
  await expect(page.getByRole('region',{ name:'完整支护配置' })).toBeVisible();
  await expect(page.getByLabel('锚杆长度')).toHaveValue('3');
  await page.getByLabel('锚杆长度').fill('3.7');
  await expect(page.getByRole('button',{ name:'生成待复核配置报告' })).toBeDisabled();
  await page.getByRole('button',{ name:'重新检查当前配置' }).click();
  await expect(page.getByRole('button',{ name:'生成待复核配置报告' })).toBeEnabled();
  await page.screenshot({ path:testInfo.outputPath('support-configuration.png'),fullPage:true });
  await page.getByRole('button',{ name:'生成待复核配置报告' }).click();
  const saveResponse=page.waitForResponse((response) => response.url().endsWith('/api/scheme/save-decision') && response.request().method() === 'POST');
  await page.getByRole('button',{ name:'保存至方案与决策台账' }).click();
  const response=await saveResponse;
  expect(response.status(),await response.text()).toBe(200);
  const saved=await response.json();
  await expect(page.getByRole('button',{ name:'已保存至台账' })).toBeDisabled();
  await page.goto('/scheme');
  await page.reload();
  const savedRow=page.getByRole('row').filter({ hasText:'临时测试主洞工作面' }).last();
  await savedRow.getByRole('button',{ name:'展开明细' }).click();
  await expect(page.getByText(saved.report.no,{ exact:false })).toBeVisible();
  await page.getByRole('button',{ name:'查看保存的方案报告' }).last().click();
  await expect(page.getByRole('dialog')).toContainText('长度 3.7 m');
  const history=await (await request.get('/api/scheme')).json();
  const row=history.records.find((item:{ schemeReportId?:string }) => item.schemeReportId);
  expect(row).toBeTruthy();
  expect(history.records.some((item:{ id:number;score:number | null }) => item.id === saved.recordId && item.score === null)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('同步冲突、缺项和无记录不会复用上个位置的值',async ({ page }) => {
  await synchronize(page,'K3601+900');
  await expect(page.getByRole('alert').filter({ hasText:'多条记录' })).toContainText('多条记录');
  await expect(page.getByLabel('隧道埋深')).toHaveValue('');
  await page.getByLabel('施工工作面').selectOption('test_face_b');
  await page.getByLabel('开挖里程桩号').fill('K3600+450');
  await page.getByRole('button',{ name:'同步数据',exact:true }).click();
  await expect(page.getByRole('alert').filter({ hasText:'缺少' })).toContainText('缺少');
  await page.getByLabel('施工工作面').selectOption('test_face_a');
  await page.getByLabel('开挖里程桩号').fill('K3599+050');
  await page.getByRole('button',{ name:'同步数据',exact:true }).click();
  await expect(page.getByRole('alert').filter({ hasText:'没有有效采集记录' })).toContainText('没有有效采集记录');
});

test('并列推荐等待人工确认，硬排除工法不可选',async ({ page }) => {
  await synchronize(page);
  await expect(page.getByLabel('隧道埋深')).toHaveValue('620');
  await page.getByLabel('隧道埋深').fill('800');
  await page.getByRole('button',{ name:'启动智能推理与决策' }).click();
  await expect(page.getByRole('button',{ name:'确认工法，读取支护模板' })).toBeDisabled();
  await expect(page.getByText('存在同优先级推荐，请人工确认。',{ exact:false })).toBeVisible();
  await page.getByRole('button',{ name:'选择台阶法' }).click();
  await expect(page.getByRole('button',{ name:'确认工法，读取支护模板' })).toBeEnabled();
  await page.getByLabel('地下水量').selectOption('涌水');
  await page.getByRole('button',{ name:'启动智能推理与决策' }).click();
  await expect(page.getByRole('button',{ name:'选择台阶法' })).toBeDisabled();
});

test('经验库实际启停影响下次推荐，导入错误保留内容且不落库',async ({ page,request }) => {
  await page.goto('/knowledge');
  const manager=page.getByRole('region',{ name:'可执行决策资料' });
  const row=manager.getByRole('row').filter({ hasText:'test_method_iv v1' });
  await row.getByRole('button',{ name:'停用',exact:true }).click();
  await expect(row.getByRole('button',{ name:'启用',exact:true })).toBeVisible();
  const response=await request.post('/api/decision/infer-methods',{ data:{ params:D1_FIXTURES.observations[0].params } });
  expect(response.ok(),await response.text()).toBeTruthy();
  expect((await response.json()).methods.some((item:{ key:string;matched:boolean }) => item.key === 'bench' && item.matched)).toBeFalsy();
  await row.getByRole('button',{ name:'启用',exact:true }).click();
  await expect(row.getByRole('button',{ name:'停用',exact:true })).toBeVisible();
  const before=await (await request.get('/api/knowledge/decision-catalog')).json();
  await manager.getByRole('button',{ name:'批量导入' }).click();
  const invalid=JSON.stringify({ formatVersion:1,rules:[{ ...D1_FIXTURES.rules[0],code:'browser_invalid',conditions:{ all:[{ field:'unknown',op:'eq',value:1 }],excludeAny:[] } }] });
  await page.getByLabel('导入资料 JSON').fill(invalid);
  await page.getByRole('button',{ name:'校验并保存' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('导入资料 JSON')).toHaveValue(invalid);
  const after=await (await request.get('/api/knowledge/decision-catalog')).json();
  expect(after.rules.length).toBe(before.rules.length);
});

test('缺少无关力学参数时仍可按已有条件匹配，不把空值作为零发送',async ({ page }) => {
  await synchronize(page,'K3600+450','test_face_b');
  await expect(page.getByRole('alert').filter({ hasText:'缺少' })).toBeVisible();
  await page.getByLabel('地下水量').selectOption('潮湿');
  await page.getByLabel('断面类型',{ exact:true }).selectOption('平导标准断面');
  const inference=page.waitForRequest((request) => request.url().endsWith('/infer-methods'));
  await page.getByRole('button',{ name:'启动智能推理与决策' }).click();
  const sent=(await inference).postDataJSON();
  expect(sent.params.elastic).toBeUndefined();
  expect(sent.params.density).toBeUndefined();
  expect(sent.mode).toBeUndefined();
  await expect(page.getByRole('button',{ name:'选择台阶法' })).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{ name:'确认工法，读取支护模板' }).click();
  await expect(page.getByRole('region',{ name:'完整支护配置' })).toContainText('test_iv_pilot');
});

test('规则页面预览不写库，新版本发布后才改变推荐',async ({ page,request }) => {
  const initial=await (await request.get('/api/knowledge/decision-catalog')).json();
  const version=Math.max(...initial.rules.filter((item:{ code:string }) => item.code === 'test_method_iv').map((item:{ version:number }) => item.version))+1;
  await page.goto('/knowledge');
  const row=page.getByRole('row').filter({ hasText:'test_method_iv v1' });
  await row.getByRole('button',{ name:'新版本' }).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('版本',{ exact:true }).fill(String(version));
  await dialog.getByLabel('规则条件 JSON').fill(JSON.stringify({ all:[{ field:'grade',op:'eq',value:'V' }],excludeAny:[] }));
  await dialog.getByLabel('保存后启用').check();
  await dialog.getByText('保存前预览规则',{ exact:true }).click();
  await dialog.getByLabel('规则预览参数').fill(JSON.stringify({ grade:'V' }));
  await dialog.getByRole('button',{ name:'执行预览' }).click();
  await expect(dialog.getByRole('status')).toContainText('规则预览：命中');
  const notSaved=await (await request.get('/api/knowledge/decision-catalog')).json();
  expect(notSaved.rules.length).toBe(initial.rules.length);
  try {
    await dialog.getByRole('button',{ name:'校验并保存' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('row').filter({ hasText:`test_method_iv v${version}` }).getByRole('button',{ name:'停用',exact:true })).toBeVisible();
    const response=await request.post('/api/decision/infer-methods',{ data:{ params:D1_FIXTURES.observations[0].params } });
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).methods.some((item:{ key:string;matched:boolean }) => item.key === 'bench' && item.matched)).toBeFalsy();
  } finally { await request.patch('/api/knowledge/decision-catalog',{ data:{ kind:'rule',code:'test_method_iv',version:1,enabled:true } }); }
});

test('完整模板表单可保存新规格，发布映射后算法使用新版本',async ({ page,request }) => {
  const initial=await (await request.get('/api/knowledge/decision-catalog')).json();
  const version=Math.max(...initial.templates.filter((item:{ code:string }) => item.code === 'test_iv_main').map((item:{ version:number }) => item.version))+1;
  const mappingVersion=Math.max(...initial.rules.filter((item:{ code:string }) => item.code === 'rule_test_iv_main').map((item:{ version:number }) => item.version))+1;
  await page.goto('/knowledge');
  await page.getByRole('button',{ name:'支护体系与参数库',exact:true }).click();
  const manager=page.getByRole('region',{ name:'可执行决策资料' });
  const card=manager.locator('div.rounded-lg').filter({ has:page.locator('b').filter({ hasText:'test_iv_main v1' }) });
  await card.getByRole('button',{ name:'新版本' }).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('版本',{ exact:true }).fill(String(version));
  await dialog.getByRole('group',{ name:'型钢钢架' }).getByLabel('纵向间距 cm').fill('75');
  await dialog.getByLabel('保存后启用').check();
  try {
    await dialog.getByRole('button',{ name:'校验并保存' }).click();
    await expect(dialog).toBeHidden();
    const published=await request.post('/api/knowledge/decision-catalog',{ data:{ formatVersion:1,rules:[{ ...D1_FIXTURES.rules[4],version:mappingVersion,templateVersion:version,enabled:true }] } });
    expect(published.ok(),await published.text()).toBeTruthy();
    const result=await request.post('/api/decision/design-support',{ data:{ params:D1_FIXTURES.observations[0].params,methodKey:'bench' } });
    expect(result.ok(),await result.text()).toBeTruthy();
    const design=await result.json();
    expect(design.template).toEqual({ code:'test_iv_main',version });
    expect(design.support.find((item:{ key:string }) => item.key === 'steel').valNum).toBe(75);
  } finally {
    await request.patch('/api/knowledge/decision-catalog',{ data:{ kind:'template',code:'test_iv_main',version:1,enabled:true } });
    await request.patch('/api/knowledge/decision-catalog',{ data:{ kind:'rule',code:'rule_test_iv_main',version:1,enabled:true } });
  }
});

test('台账删除：取消保留、单条清理、清空确认及资料保留',async ({ page,request }) => {
  async function saveOne() {
    await synchronize(page);
    await page.getByRole('button',{ name:'启动智能推理与决策' }).click();
    await page.getByRole('button',{ name:'确认工法，读取支护模板' }).click();
    await page.getByRole('button',{ name:'生成待复核配置报告' }).click();
    const response=page.waitForResponse((r) => r.url().endsWith('/api/scheme/save-decision') && r.request().method() === 'POST');
    await page.getByRole('button',{ name:'保存至方案与决策台账' }).click();
    const saved=await response;expect(saved.ok()).toBeTruthy();return saved.json();
  }
  const saved=await saveOne();
  const history=await (await request.get('/api/scheme')).json();
  const savedReportId=history.records.find((item:{ id:number;schemeReportId:string }) => item.id === saved.recordId).schemeReportId;
  expect((await request.get(`/api/scheme/reports/${savedReportId}`)).status()).toBe(200);
  await page.goto('/scheme');
  const remove=page.getByRole('button',{ name:`删除记录 ${saved.recordId}`,exact:true });
  await remove.click();await page.getByRole('button',{ name:'取消',exact:true }).click();
  await expect(remove).toBeVisible();
  await remove.click();
  const deletion=page.waitForResponse((r) => r.request().method() === 'DELETE');
  await page.getByRole('button',{ name:'确认删除',exact:true }).click();
  expect((await deletion).ok()).toBeTruthy();
  await expect(remove).toHaveCount(0);
  await page.reload();await expect(remove).toHaveCount(0);
  expect((await request.get(`/api/scheme/reports/${savedReportId}`)).status()).toBe(404);
  await saveOne();await page.goto('/scheme');
  const catalogBefore=await (await request.get('/api/knowledge/decision-catalog')).json();
  const bad=await request.delete('/api/scheme?scope=local-test',{ data:{ confirmation:'错误' } });expect(bad.status()).toBe(400);
  await page.getByRole('button',{ name:'清空测试记录',exact:true }).click();
  await expect(page.getByRole('button',{ name:'确认删除',exact:true })).toBeDisabled();
  await page.getByRole('button',{ name:'取消',exact:true }).click();
  await page.getByRole('button',{ name:'清空测试记录',exact:true }).click();
  await page.getByLabel('清空确认文字').fill('清空测试记录');
  const cleared=page.waitForResponse((r) => r.request().method() === 'DELETE');
  await page.getByRole('button',{ name:'确认删除',exact:true }).click();
  expect((await cleared).ok()).toBeTruthy();
  await expect(page.getByText('当前筛选条件下暂无决策记录')).toBeVisible();
  await page.reload();await expect(page.getByText('当前筛选条件下暂无决策记录')).toBeVisible();
  expect(await (await request.get('/api/knowledge/decision-catalog')).json()).toEqual(catalogBefore);
});
