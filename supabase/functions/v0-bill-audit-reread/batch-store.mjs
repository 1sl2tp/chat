// Only call from a server worker with the existing service-role client.
export function createBatchStore(client){
 const invoke=async(name,args)=>{const {data,error}=await client.rpc(name,args);if(error)throw Error(name+":"+String(error.code||"rpc_failed"));return data};
 return {
 reserve:job=>invoke("v0_bill_batch_reserve",{p_job:job.jobId,p_model:job.model,p_items:job.items}),
 markSubmitted:(id,op)=>invoke("v0_bill_batch_transition",{p_job:id,p_operation:op,p_state:"submitted"}),
 markAmbiguous:(id,op)=>invoke("v0_bill_batch_transition",{p_job:id,p_operation:op,p_state:"ambiguous"}),
 save:({jobId,receiptId,completedAt,corrections,fields,state})=>invoke("v0_bill_batch_save",{p_job:jobId,p_receipt:receiptId,p_completed:completedAt,p_corrections:corrections,p_fields:fields,p_state:state})
 };
}
