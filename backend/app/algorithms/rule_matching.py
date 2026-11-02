"""Deterministic conditions. Missing input never proves a condition or exclusion false."""
from app.models import Condition, DecisionRule


def matches(condition: Condition, params: dict[str, object]) -> bool | None:
    if condition.field not in params or params[condition.field] is None:
        return None
    value = params[condition.field]
    if condition.op == 'eq':
        return value == condition.value
    if condition.op == 'in':
        return value in (condition.values or [])
    if not isinstance(value,(int,float)) or isinstance(value,bool):
        return None
    lower = condition.min is None or (value >= condition.min if condition.min_inclusive else value > condition.min)
    upper = condition.max is None or (value <= condition.max if condition.max_inclusive else value < condition.max)
    return lower and upper


def match_rule(rule: DecisionRule, params: dict[str, object]) -> str:
    values = [matches(item,params) for item in rule.conditions.all]
    if False in values:
        return 'unmatched'
    exclusions = [matches(item,params) for item in rule.conditions.exclude_any]
    if True in exclusions:
        return 'excluded'
    if None in values or None in exclusions:
        return 'insufficient'
    return 'matched'
