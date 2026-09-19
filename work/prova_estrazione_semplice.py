import ollama,json
from pydantic import BaseModel,Field
class D(BaseModel):
 nome:str=Field(description='Exact patient name from last message or empty string')
 telefono:str=Field(description='Exact phone number from last message or empty string')
 trattamento:str=Field(description='Exact requested dental service/concern from last message or empty string. Emotions are not services.')
 tempistica:str=Field(description='Exact intended time of care from last message or empty string. Fear and questions are not timing.')
prompt='''Extract four fields from the Italian message. Each value must be an exact quote of the message or empty string. Do not fill absent information. Only extract a field when it answers that specific field. No inference. Examples:
"Ho paura del dentista" -> {"nome":"","telefono":"","trattamento":"","tempistica":""}
"non prima di Natale" -> {"nome":"","telefono":"","trattamento":"","tempistica":"non prima di Natale"}
"vorrei togliere il dente del giudizio" -> {"nome":"","telefono":"","trattamento":"togliere il dente del giudizio","tempistica":""}
"quanto dura uno sbiancamento?" -> {"nome":"","telefono":"","trattamento":"sbiancamento","tempistica":""}
'''
for text in ['Ho paura del dentista, mi vergogno un po\u0027','quando torno dalle ferie','vorrei sistemare un dente che si è scheggiato','dopo aver preso lo stipendio']:
 r=ollama.chat(model='llama3',format=D.model_json_schema(),messages=[{'role':'system','content':prompt},{'role':'user','content':text}],options={'temperature':0,'num_predict':220})
 print(text,r.message.content,flush=True)
