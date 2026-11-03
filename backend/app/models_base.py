from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Number = Annotated[float, Field(allow_inf_nan=False)]

class Contract(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel,populate_by_name=True,
                              extra='forbid',allow_inf_nan=False,strict=True)
