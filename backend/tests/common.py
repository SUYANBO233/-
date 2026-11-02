from uuid import uuid4

PARAMS = {
    'hardness': '硬', 'integrity': '较破碎', 'thickness': '厚层', 'water': '潮湿', 'grade': 'IV',
    'depth': 620, 'section': '主洞标准断面', 'density': 2550, 'sharePrimary': 0.55, 'shareSecondary': 0.3,
    'friction': 32, 'elastic': 2.85, 'cohesion': 260, 'poisson': 0.28, 'stressV': 21.5, 'stressH': 13.2,
}


def save_request() -> dict:
    return {'requestKey': str(uuid4()), 'mode': 'manual', 'workface': 'shayi_main', 'mileage': 'K3601+200', 'params': PARAMS.copy(),
            'revisions': [{'methodKey': 'bench', 'reason': '初始方案', 'values': {'steel': 80, 'shot': 22, 'anchor': 3, 'advance': 40}}]}
